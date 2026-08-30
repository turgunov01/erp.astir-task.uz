/**
 * Prisma returns BigInt for 64-bit columns such as file sizes, and
 * JSON.stringify throws on BigInt rather than serialising it.
 *
 * Emitting a string keeps precision beyond 2^53 intact; the UI parses what it
 * needs. Installed once at boot so no route has to remember to convert.
 */
export function installBigIntSerializer(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => string }
  if (proto.toJSON) return
  proto.toJSON = function toJSON(this: bigint) {
    return this.toString()
  }
}
