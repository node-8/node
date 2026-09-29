# RegExp classes in lookbehind

Supported Unicode classes in node-8 lookbehind consume the same internal WTF-8
characters as forward matching. `/(?<=(.))中/du` on `😀中` matches 中 at [4,7]
and captures the emoji at [0,4]. Captures retain their original bytes.

Malformed input uses the forward maximal-subpart partition in either direction.
On bytes `E2 82 58`, `/(?<=(.))X/du` captures both `E2 82` bytes at [0,2]. On
`E0 80 58`, it captures only `80` at [1,2]: E0 cannot accept 80 as its second
byte. A canonical nonmember cannot match by treating its continuation bytes as
replacement characters. Internal surrogate code points remain distinct from
U+FFFD.

Lowering tracks each lookaround's direction, including nested lookahead within
lookbehind. Reverse classes reuse byte alternatives; a bounded assertion checks
the start of an otherwise standalone malformed continuation. It inspects at
most three preceding bytes and the current byte, without decoding the whole
subject or allocating a code-point array.

Positive and negative lookbehind, captures, quantifiers and local flags are
covered. Forward exact references can use a capture made in lookbehind. Trees
combining a decoder with a backward reference, and folded references with
lookbehind, retain conservative guards. General large property/set classes and
malformed patterns remain separate work. Functional coverage on Linux x64 does
not establish performance or other-platform acceptance.
