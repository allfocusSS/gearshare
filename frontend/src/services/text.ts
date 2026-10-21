/** JSON Schema text limits count Unicode code points, including combining marks. */
export const textLength = (value: string): number => [...value].length

/** In Unicode mode a valid surrogate pair is one supplementary code point. */
export const hasUnpairedSurrogate = (value: string): boolean => /[\uD800-\uDFFF]/u.test(value)
