import re

from routers.books import _new_book_code


def test_new_book_codes_always_have_the_same_length_and_format() -> None:
    codes = [_new_book_code() for _ in range(1_000)]

    assert all(len(code) == 11 for code in codes)
    assert all(re.fullmatch(r"MF-[A-HJ-NP-Z2-9]{8}", code) for code in codes)
