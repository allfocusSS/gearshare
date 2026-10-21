"""Default Unicode lowercase parity with the pinned Node 24 frontend runtime.

Node 24.19 uses Unicode 17; Python 3.12 uses Unicode 15. These compact deltas
were compared against Node's toLowerCase/Cased/Case_Ignorable for every scalar.
They also cover the context-sensitive final-sigma rule, not just new mappings.
Recheck on runtime upgrades. This is neither casefold nor normalization.
"""

from unicodedata import category

_LOWER_ADDITIONS = {
    0x1C89: 0x1C8A, 0xA7CB: 0x264, 0xA7CC: 0xA7CD, 0xA7CE: 0xA7CF,
    0xA7D2: 0xA7D3, 0xA7D4: 0xA7D5, 0xA7DA: 0xA7DB, 0xA7DC: 0x19B,
    **{cp: cp + 0x20 for cp in range(0x10D50, 0x10D66)},  # Garay (Unicode 16).
    **{cp: cp + 0x1B for cp in range(0x16EA0, 0x16EB9)},  # Beria Erfe (17).
}
_CASED_ADDITIONS = (
    (0x1C89, 0x1C8A), (0xA7CB, 0xA7CF), (0xA7D2, 0xA7D2), (0xA7D4, 0xA7D4),
    (0xA7DA, 0xA7DC), (0xA7F1, 0xA7F1), (0x10D50, 0x10D65), (0x10D70, 0x10D85),
    (0x16EA0, 0x16EB8), (0x16EBB, 0x16ED3),
)
# Case_Ignorable = Mn/Me/Cf/Lm/Sk plus selected punctuation. Include new
# characters whose category Python 3.12 does not yet know. U+1171E ceased
# being ignorable; U+0295 ceased being Cased in Unicode 17.
_IGNORABLE_ADDITIONS = (
    (0x27, 0x27), (0x2E, 0x2E), (0x3A, 0x3A), (0xB7, 0xB7), (0x387, 0x387),
    (0x55F, 0x55F), (0x5F4, 0x5F4), (0x897, 0x897), (0x1ACF, 0x1ADD),
    (0x1AE0, 0x1AEB), (0x2018, 0x2019), (0x2024, 0x2024), (0x2027, 0x2027),
    (0xA7F1, 0xA7F1), (0xFE13, 0xFE13), (0xFE52, 0xFE52), (0xFE55, 0xFE55),
    (0xFF07, 0xFF07), (0xFF0E, 0xFF0E), (0xFF1A, 0xFF1A), (0x10D4E, 0x10D4E),
    (0x10D69, 0x10D6D), (0x10D6F, 0x10D6F), (0x10EC5, 0x10EC5),
    (0x10EFA, 0x10EFC), (0x113BB, 0x113C0), (0x113CE, 0x113CE), (0x113D0, 0x113D0),
    (0x113D2, 0x113D2), (0x113E1, 0x113E2), (0x11B60, 0x11B60),
    (0x11B62, 0x11B64), (0x11B66, 0x11B66), (0x11DD9, 0x11DD9),
    (0x11F5A, 0x11F5A), (0x1611E, 0x16129), (0x1612D, 0x1612F),
    (0x16D40, 0x16D42), (0x16D6B, 0x16D6C), (0x16FF2, 0x16FF3),
    (0x1E5EE, 0x1E5EF), (0x1E6E3, 0x1E6E3), (0x1E6E6, 0x1E6E6),
    (0x1E6EE, 0x1E6EF), (0x1E6F5, 0x1E6F5), (0x1E6FF, 0x1E6FF),
)


def _in_ranges(cp: int, ranges: tuple[tuple[int, int], ...]) -> bool:
    return any(start <= cp <= end for start, end in ranges)


def _cased(character: str) -> bool:
    cp = ord(character)
    return cp != 0x295 and (
        character.islower() or character.isupper() or character.istitle() or _in_ranges(cp, _CASED_ADDITIONS)
    )


def _ignorable(character: str) -> bool:
    cp = ord(character)
    return cp != 0x1171E and (category(character) in {"Mn", "Me", "Cf", "Lm", "Sk"} or _in_ranges(cp, _IGNORABLE_ADDITIONS))


def default_lower(value: str) -> str:
    if "Σ" not in value:
        return value.lower().translate(_LOWER_ADDITIONS)
    lowered = []
    for index, character in enumerate(value):
        if character == "Σ":
            before, after = index - 1, index + 1
            while before >= 0 and _ignorable(value[before]):
                before -= 1
            while after < len(value) and _ignorable(value[after]):
                after += 1
            final = before >= 0 and _cased(value[before]) and (after == len(value) or not _cased(value[after]))
            lowered.append("ς" if final else "σ")
        else:
            cp = ord(character)
            lowered.append(chr(_LOWER_ADDITIONS[cp]) if cp in _LOWER_ADDITIONS else character.lower())
    return "".join(lowered)
