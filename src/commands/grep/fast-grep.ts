/**
 * Fast Grep Utilities
 *
 * Optimized pattern matching using streaming and byte-level search.
 * For literal patterns, this can be 10-100x faster than regex-based grep.
 */

const NEWLINE = 0x0a
const textDecoder = new TextDecoder('utf-8', { fatal: false })
const textEncoder = new TextEncoder()

export interface FastGrepOptions {
	pattern: string
	regex: RegExp
	isLiteral: boolean
	ignoreCase: boolean
	invertMatch: boolean
	wholeWord: boolean
	lineRegexp: boolean
	maxCount: number
	onlyMatching: boolean
}

export interface GrepLineResult {
	lineNumber: number
	content: string
	matches?: string[]
}

/**
 * Check if a chunk likely contains binary content (null byte in first 8KB)
 */
export function isBinaryChunk(chunk: Uint8Array): boolean {
	const checkLength = Math.min(chunk.length, 8192)
	for (let i = 0; i < checkLength; i++) {
		if (chunk[i] === 0x00) return true
	}
	return false
}

/**
 * Find all occurrences of a literal pattern in a chunk (case-sensitive)
 */
export function findPatternPositions(
	chunk: Uint8Array,
	pattern: Uint8Array
): number[] {
	const positions: number[] = []
	if (pattern.length === 0 || chunk.length < pattern.length) return positions

	const firstByte = pattern[0]!
	const patternLen = pattern.length
	const searchEnd = chunk.length - patternLen + 1

	outer: for (let i = 0; i < searchEnd; i++) {
		if (chunk[i] !== firstByte) continue

		for (let j = 1; j < patternLen; j++) {
			if (chunk[i + j] !== pattern[j]) continue outer
		}
		positions.push(i)
	}

	return positions
}

/**
 * Find all occurrences of a literal pattern in a chunk (case-insensitive)
 */
export function findPatternPositionsIgnoreCase(
	chunk: Uint8Array,
	pattern: Uint8Array
): number[] {
	const positions: number[] = []
	if (pattern.length === 0 || chunk.length < pattern.length) return positions

	const patternLen = pattern.length
	const searchEnd = chunk.length - patternLen + 1

	// Pre-lowercase pattern
	const lowerPattern = new Uint8Array(patternLen)
	for (let i = 0; i < patternLen; i++) {
		lowerPattern[i] = toLowerAscii(pattern[i]!)
	}
	const firstByte = lowerPattern[0]!

	outer: for (let i = 0; i < searchEnd; i++) {
		if (toLowerAscii(chunk[i]!) !== firstByte) continue

		for (let j = 1; j < patternLen; j++) {
			if (toLowerAscii(chunk[i + j]!) !== lowerPattern[j]) continue outer
		}
		positions.push(i)
	}

	return positions
}

function toLowerAscii(byte: number): number {
	if (byte >= 65 && byte <= 90) return byte + 32
	return byte
}

/**
 * Check if a position is at a word boundary
 */
function isWordByte(byte: number): boolean {
	return (
		(byte >= 48 && byte <= 57) || // 0-9
		(byte >= 65 && byte <= 90) || // A-Z
		(byte >= 97 && byte <= 122) || // a-z
		byte === 95 // _
	)
}

function isWordBoundary(
	chunk: Uint8Array,
	pos: number,
	patternLen: number
): boolean {
	const beforeOk = pos === 0 || !isWordByte(chunk[pos - 1]!)
	const afterOk =
		pos + patternLen >= chunk.length || !isWordByte(chunk[pos + patternLen]!)
	return beforeOk && afterOk
}

/**
 * Extract a line from chunk given a position within that line
 */
function extractLineAt(
	chunk: Uint8Array,
	pos: number
): { start: number; end: number; content: string } {
	let start = pos
	while (start > 0 && chunk[start - 1] !== NEWLINE) start--

	let end = pos
	while (end < chunk.length && chunk[end] !== NEWLINE) end++

	const content = textDecoder.decode(chunk.slice(start, end))
	return { start, end, content }
}

/**
 * Count newlines in a range
 */
function countNewlines(chunk: Uint8Array, start: number, end: number): number {
	let count = 0
	for (let i = start; i < end; i++) {
		if (chunk[i] === NEWLINE) count++
	}
	return count
}

/**
 * Fast grep on a buffer using literal byte search
 */
export function grepBufferLiteral(
	buffer: Uint8Array,
	options: FastGrepOptions
): GrepLineResult[] {
	const results: GrepLineResult[] = []
	const patternBytes = textEncoder.encode(options.pattern)

	const findFn = options.ignoreCase
		? findPatternPositionsIgnoreCase
		: findPatternPositions
	const positions = findFn(buffer, patternBytes)

	if (options.invertMatch) {
		// For invert match, we need to find lines WITHOUT matches
		return grepBufferInvert(buffer, positions, options)
	}

	// Group positions by line
	const lineMatches = new Map<
		number,
		{ lineNumber: number; content: string; positions: number[] }
	>()
	let currentLineStart = 0
	let currentLineNum = 1

	for (const pos of positions) {
		// Fast-forward to the line containing this position
		while (currentLineStart < pos) {
			const nlPos = buffer.indexOf(NEWLINE, currentLineStart)
			if (nlPos === -1 || nlPos >= pos) break
			currentLineStart = nlPos + 1
			currentLineNum++
		}

		// Check word boundary if needed
		if (
			options.wholeWord &&
			!isWordBoundary(buffer, pos, patternBytes.length)
		) {
			continue
		}

		const line = extractLineAt(buffer, pos)

		// Check line regexp
		if (options.lineRegexp && line.content !== options.pattern) {
			continue
		}

		if (!lineMatches.has(currentLineNum)) {
			lineMatches.set(currentLineNum, {
				lineNumber: currentLineNum,
				content: line.content,
				positions: [],
			})
		}
		lineMatches.get(currentLineNum)!.positions.push(pos - line.start)

		if (options.maxCount > 0 && lineMatches.size >= options.maxCount) break
	}

	for (const [, match] of lineMatches) {
		if (options.onlyMatching) {
			results.push({
				lineNumber: match.lineNumber,
				content: options.pattern,
			})
		} else {
			results.push({
				lineNumber: match.lineNumber,
				content: match.content,
			})
		}
	}

	return results
}

/**
 * Grep for lines that DON'T match (invert)
 */
function grepBufferInvert(
	buffer: Uint8Array,
	matchPositions: number[],
	options: FastGrepOptions
): GrepLineResult[] {
	const results: GrepLineResult[] = []
	const matchSet = new Set<number>()

	// Find which line numbers have matches
	let lineStart = 0
	let lineNum = 1
	let posIdx = 0

	while (lineStart < buffer.length && posIdx < matchPositions.length) {
		const lineEnd = buffer.indexOf(NEWLINE, lineStart)
		const actualEnd = lineEnd === -1 ? buffer.length : lineEnd

		while (
			posIdx < matchPositions.length &&
			matchPositions[posIdx]! < actualEnd
		) {
			if (matchPositions[posIdx]! >= lineStart) {
				matchSet.add(lineNum)
			}
			posIdx++
		}

		lineStart = actualEnd + 1
		lineNum++
	}

	// Now collect lines that don't have matches
	lineStart = 0
	lineNum = 1
	let matchCount = 0

	while (lineStart < buffer.length) {
		const lineEnd = buffer.indexOf(NEWLINE, lineStart)
		const actualEnd = lineEnd === -1 ? buffer.length : lineEnd

		if (!matchSet.has(lineNum)) {
			const content = textDecoder.decode(buffer.slice(lineStart, actualEnd))
			results.push({ lineNumber: lineNum, content })
			matchCount++

			if (options.maxCount > 0 && matchCount >= options.maxCount) break
		}

		lineStart = actualEnd + 1
		lineNum++
	}

	return results
}

/**
 * Grep using regex (for complex patterns)
 */
export function grepBufferRegex(
	buffer: Uint8Array,
	options: FastGrepOptions
): GrepLineResult[] {
	const content = textDecoder.decode(buffer)
	let lines = content.split('\n')
	// If content ends with newline, split() creates an empty string at the end which we should ignore
	if (content.endsWith('\n')) {
		lines.pop()
	}

	const results: GrepLineResult[] = []
	const regex = options.regex

	let matchCount = 0

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!
		regex.lastIndex = 0
		const hasMatch = regex.test(line)

		if (hasMatch !== options.invertMatch) {
			if (options.onlyMatching && !options.invertMatch) {
				regex.lastIndex = 0
				for (
					let match = regex.exec(line);
					match !== null;
					match = regex.exec(line)
				) {
					results.push({ lineNumber: i + 1, content: match[0] })
					if (match[0].length === 0) regex.lastIndex++
				}
			} else {
				results.push({ lineNumber: i + 1, content: line })
			}
			matchCount++

			if (options.maxCount > 0 && matchCount >= options.maxCount) break
		}
	}

	return results
}

/**
 * Stream-based grep - processes chunks as they arrive
 */
export async function grepStream(
	stream: ReadableStream<Uint8Array>,
	options: FastGrepOptions,
	onResult: (result: GrepLineResult) => void
): Promise<{ matchCount: number; lineCount: number }> {
	const reader = stream.getReader()
	let buffer = new Uint8Array(0)
	let lineOffset = 0
	let matchCount = 0
	let isFirstChunk = true

	try {
		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				// Process remaining buffer
				if (buffer.length > 0) {
					const results = options.isLiteral
						? grepBufferLiteral(buffer, options)
						: grepBufferRegex(buffer, options)

					for (const result of results) {
						onResult({ ...result, lineNumber: result.lineNumber + lineOffset })
						matchCount++
						if (options.maxCount > 0 && matchCount >= options.maxCount) break
					}
				}
				break
			}

			// Append new data
			const newBuffer = new Uint8Array(buffer.length + value.length)
			newBuffer.set(buffer)
			newBuffer.set(value, buffer.length)
			buffer = newBuffer

			// Process complete lines (keep last incomplete line in buffer)
			const lastNewline = buffer.lastIndexOf(NEWLINE)
			if (lastNewline !== -1) {
				const complete = buffer.slice(0, lastNewline + 1)
				buffer = buffer.slice(lastNewline + 1)

				const results = options.isLiteral
					? grepBufferLiteral(complete, options)
					: grepBufferRegex(complete, options)

				for (const result of results) {
					onResult({ ...result, lineNumber: result.lineNumber + lineOffset })
					matchCount++
					if (options.maxCount > 0 && matchCount >= options.maxCount) {
						return {
							matchCount,
							lineCount:
								lineOffset + countNewlines(complete, 0, complete.length),
						}
					}
				}

				lineOffset += countNewlines(complete, 0, complete.length)
			}
		}
	} finally {
		reader.releaseLock()
	}

	return { matchCount, lineCount: lineOffset + (buffer.length > 0 ? 1 : 0) }
}
