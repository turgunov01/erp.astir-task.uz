/**
 * The shape another language must match: the Russian file's keys, any string.
 *
 * `satisfies Messages<typeof ru>` in uz/en/tr makes a missing or misspelt key
 * a compile error, so the four catalogues cannot drift apart.
 */
export type Messages<T> = {
  [K in keyof T]: T[K] extends string ? string : Messages<T[K]>
}

/** Every dotted path to a leaf string, e.g. `common.errors.forbidden`. */
export type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : LeafPaths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** Values substituted into `{name}` placeholders; `count` also picks the plural form. */
export type MessageParams = Record<string, string | number | null | undefined>
