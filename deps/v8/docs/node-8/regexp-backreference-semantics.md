# RegExp backreference equality

The node-8 target contract compares backreferences as sequences of decoded
internal WTF-8 code points. Case-sensitive references compare those values
directly; ignore-case references additionally apply Unicode simple folding.
This rule was confirmed on 2026-09-29.

Malformed maximal subparts decode to U+FFFD. Different byte encodings of the
same decoded sequence can therefore match a reference. On raw bytes `FF FE`,
`/^(.)\1$/du` matches both bytes and captures the original `FF` byte with indices
`[[0, 2], [0, 1]]`. On `FF E2 82`, the target U+FFFD occupies two bytes, so the
match ends at byte 3. No input or captured bytes are rewritten.

References must consume complete decoded target characters. A captured `C3`
subpart must not match just the first byte of a target `C3 A9` (é). Internal
WTF-8 surrogate values remain distinct from U+FFFD. Simple folding does not
expand sharp-s to `ss`.

Captured values, match positions, capture bounds and `lastIndex` remain byte
based. Ordinary string equality continues to compare raw bytes.

The forward implementation uses bounded streaming comparison and retains direct
byte comparison when a bounded compile-time proof establishes that the capture
has a unique canonical encoding excluding U+FFFD. This is compiler metadata,
not a new String flag. Reverse decoder/folded combinations remain separate
implementation work. Functional validation does not imply performance acceptance.
