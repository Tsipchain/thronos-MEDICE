"""
Validators for national health IDs across different countries.
Supports: AMKA (GR), KVNR (DE), SVNR (AT), SNILS (RU), NHS (GB), NIR (FR), BSN (NL), PHS (CA), SSN (US)
"""


def luhn_checksum(card_number: str) -> bool:
    """Validate using Luhn algorithm."""
    def digits_of(n):
        return [int(d) for d in str(n)]
    digits = digits_of(card_number)
    odd_digits = digits[-1::-2]
    even_digits = digits[-2::-2]
    checksum = sum(odd_digits)
    for d in even_digits:
        checksum += sum(digits_of(d * 2))
    return checksum % 10 == 0


def validate_amka(amka: str) -> tuple[bool, str]:
    """
    Validate Greek AMKA (ΑΜΚ Α - Αριθμός Μητρώου Κοινωνικής Ασφάλειας).
    Must be 11 digits with valid Luhn checksum.
    Format: HHHHHHDDMMYY
    HH = birth location code
    DD = birth day
    MM = birth month
    YY = birth year (last 2 digits)
    """
    amka = amka.strip()
    if not amka.isdigit():
        return False, "AMKA πρέπει να περιέχει μόνο αριθμούς"
    if len(amka) != 11:
        return False, f"AMKA πρέπει να έχει 11 ψηφία (έχει {len(amka)})"

    # Check day and month
    day = int(amka[4:6])
    month = int(amka[6:8])
    if day < 1 or day > 31:
        return False, "Μέρα γέννησης πρέπει να είναι 1-31"
    if month < 1 or month > 12:
        return False, "Μήνας γέννησης πρέπει να είναι 1-12"

    if not luhn_checksum(amka):
        return False, "AMKA: Άκυρο άθροισμα ελέγχου"

    return True, "Έγκυρη AMKA"


def validate_kvnr(kvnr: str) -> tuple[bool, str]:
    """
    Validate German KVNR (Krankenversicherungsnummer).
    10 digit format: KKBBEEEEEE
    KK = health insurance company code
    BB = date of birth (2 digits)
    EEEE = individual number
    E = check digit
    """
    kvnr = kvnr.replace(" ", "").replace("-", "").strip()
    if not kvnr.isdigit():
        return False, "KVNR muss nur Ziffern enthalten"
    if len(kvnr) != 10:
        return False, f"KVNR muss 10 Ziffern haben (hat {len(kvnr)})"
    return True, "Gültige KVNR"


def validate_svnr(svnr: str) -> tuple[bool, str]:
    """
    Validate Austrian SVNR (Sozialversicherungsnummer).
    10 digit format with specific structure.
    """
    svnr = svnr.replace(" ", "").replace("-", "").strip()
    if not svnr.isdigit():
        return False, "SVNR muss nur Ziffern enthalten"
    if len(svnr) != 10:
        return False, f"SVNR muss 10 Ziffern haben (hat {len(svnr)})"
    return True, "Gültige SVNR"


def validate_snils(snils: str) -> tuple[bool, str]:
    """
    Validate Russian СНИЛС (Страховой номер индивидуального лицевого счета).
    11 digit number with check digits.
    """
    snils = snils.replace(" ", "").replace("-", "").strip()
    if not snils.isdigit():
        return False, "СНИЛС должен содержать только цифры"
    if len(snils) != 11:
        return False, f"СНИЛС должен иметь 11 цифр (имеет {len(snils)})"
    return True, "Действительный СНИЛС"


def validate_nhs(nhs: str) -> tuple[bool, str]:
    """
    Validate UK NHS number.
    10 digit format.
    """
    nhs = nhs.replace(" ", "").replace("-", "").strip()
    if not nhs.isdigit():
        return False, "NHS number must contain only digits"
    if len(nhs) != 10:
        return False, f"NHS number must have 10 digits (has {len(nhs)})"
    return True, "Valid NHS number"


def validate_nir(nir: str) -> tuple[bool, str]:
    """
    Validate French NIR (Numéro d'Inscription au Répertoire / INSEE).
    15 digit number.
    """
    nir = nir.replace(" ", "").strip()
    if not nir.isdigit():
        return False, "NIR doit contenir uniquement des chiffres"
    if len(nir) != 15:
        return False, f"NIR doit avoir 15 chiffres (a {len(nir)})"
    return True, "NIR valide"


def validate_bsn(bsn: str) -> tuple[bool, str]:
    """
    Validate Dutch BSN (Burgerservicenummer).
    9 digit number with checksum.
    """
    bsn = bsn.replace(" ", "").replace("-", "").strip()
    if not bsn.isdigit():
        return False, "BSN mag alleen nummers bevatten"
    if len(bsn) != 9:
        return False, f"BSN moet 9 cijfers hebben (heeft {len(bsn)})"
    return True, "Geldig BSN"


def validate_phn(phn: str) -> tuple[bool, str]:
    """
    Validate Canadian Provincial Health Number.
    Format varies by province (typically 10-12 chars).
    """
    phn = phn.replace(" ", "").replace("-", "").strip().upper()
    if len(phn) < 10 or len(phn) > 12:
        return False, f"PHN must be 10-12 characters (has {len(phn)})"
    if not phn.replace(" ", "").isalnum():
        return False, "PHN must contain only alphanumeric characters"
    return True, "Valid PHN"


def validate_ssn(ssn: str) -> tuple[bool, str]:
    """
    Validate US Social Security Number.
    Format: XXX-XX-XXXX (9 digits).
    Note: This is format validation only, not authenticity validation.
    """
    ssn = ssn.replace(" ", "").replace("-", "").strip()
    if not ssn.isdigit():
        return False, "SSN must contain only digits"
    if len(ssn) != 9:
        return False, f"SSN must have 9 digits (has {len(ssn)})"
    # Basic sanity checks
    if ssn[:3] == "000" or ssn[3:5] == "00" or ssn[5:] == "0000":
        return False, "Invalid SSN (invalid segment)"
    if ssn[:3] == "666":
        return False, "Invalid SSN (area 666 not assigned)"
    if int(ssn[:3]) > 772:
        return False, "Invalid SSN (area number too high)"
    return True, "Valid SSN format"


def validate_health_id(health_id_type: str, health_id: str, country: str = None) -> tuple[bool, str]:
    """
    Main validator dispatcher.
    Returns (is_valid, message)
    """
    validators = {
        "amka":  validate_amka,
        "kvnr":  validate_kvnr,
        "svnr":  validate_svnr,
        "snils": validate_snils,
        "nhs":   validate_nhs,
        "nir":   validate_nir,
        "bsn":   validate_bsn,
        "phn":   validate_phn,
        "ssn":   validate_ssn,
    }

    if health_id_type not in validators:
        return False, f"Άγνωστος τύπος αναγνώρισης: {health_id_type}"

    return validators[health_id_type](health_id)
