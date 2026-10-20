"""Authoring guards for ``openapi.yml`` that need neither Redocly nor Spectral.

``openapi-spec-validator`` and the OpenAPI 3.1 meta-schema are tolerant: an unquoted comma inside a YAML flow
mapping (``{type: string, description: Human-readable, safe to show.}``) parses into a truncated description plus a
junk null-valued key, and a request example that violates its own schema is not an error to them. Independent QA of
#6 found both with Redocly and Spectral. These tests catch the same class of defect locally:

* the YAML is read at node level, so duplicate keys and empty (implicit-null) values anywhere are reported;
* the parsed tree is walked structurally: no ``null`` in a structural position, no whitespace in a key, every
  ``description`` a complete sentence, no unknown keyword in a schema object;
* every ``example`` / ``examples`` value in the document is validated against its own schema *exactly as written*
  (no implicit ``x-trimmed`` normalisation) and must already be in trimmed form.

The check functions take text or a loaded document, so ``backend/tests`` can be pointed at a defective copy of the
file (see ``_docs/evidence.md``) to prove that each guard fails on it.
"""

from __future__ import annotations

import re
from typing import Any, Iterator

import pytest
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from test_openapi_contract import BASE, SPEC_PATH, operations, resolve, schema_errors, trimmed

# --------------------------------------------------------------------------- YAML at node level


def _is_empty(node: yaml.Node) -> bool:
    """A plain scalar with no text: the parser's reading of ``key:``, ``{key}`` or a dangling ``- ``."""
    return isinstance(node, yaml.ScalarNode) and node.value == "" and node.style is None


def yaml_problems(text: str) -> list[str]:
    """Duplicate mapping keys and empty (implicit-null) values anywhere in the document, with line numbers."""
    problems: list[str] = []

    def visit(node: yaml.Node, path: str) -> None:
        if isinstance(node, yaml.MappingNode):
            seen: set[Any] = set()
            for key_node, value_node in node.value:
                key = key_node.value if isinstance(key_node, yaml.ScalarNode) else repr(key_node)
                where = f"{path}/{key}"
                line = key_node.start_mark.line + 1
                if key in seen:
                    problems.append(f"line {line}: duplicate key {where}")
                seen.add(key)
                if _is_empty(value_node):
                    problems.append(f"line {line}: {where} has an empty value (an unquoted comma or colon in a flow mapping splits plain text; quote it)")
                visit(value_node, where)
        elif isinstance(node, yaml.SequenceNode):
            for index, item in enumerate(node.value):
                if _is_empty(item):
                    problems.append(f"line {item.start_mark.line + 1}: {path}[{index}] is empty")
                visit(item, f"{path}[{index}]")

    visit(yaml.compose(text, Loader=yaml.SafeLoader), "")
    return problems


# --------------------------------------------------------------------------- structural walk of the parsed tree

# Keys whose value is a map of arbitrary names (so a name such as `description` is not the keyword), and keys whose
# value is data, not structure (examples, enums, vendor extensions).
NAME_MAPS = {
    "properties", "patternProperties", "$defs", "schemas", "responses", "parameters", "examples", "headers",
    "securitySchemes", "requestBodies", "links", "callbacks", "pathItems", "content", "paths", "mapping", "encoding",
    "variables", "dependentSchemas",
}
DATA_KEYS = {"enum", "const", "default", "example", "value"}
TERMINAL_PUNCTUATION = (".", ")", "`", ":", "!", "?")


def structure_problems(document: dict[str, Any]) -> list[str]:
    """``null`` in a structural position, whitespace in a key, and incomplete ``description`` / ``summary`` text."""
    problems: list[str] = []

    def check_text(where: str, key: str, value: Any) -> None:
        if not isinstance(value, str) or not value.strip():
            problems.append(f"{where}: {key} must be a non-empty string, got {value!r}")
        elif key == "description" and not value.rstrip().endswith(TERMINAL_PUNCTUATION):
            problems.append(f"{where}: description looks truncated (does not end like a sentence): ...{value.rstrip()[-40:]!r}")

    def walk(node: Any, path: str, names: bool = False) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                here = f"{path}/{key}"
                is_data = not names and (key in DATA_KEYS or str(key).startswith("x-") or (key == "examples" and not isinstance(value, dict)))
                if not isinstance(key, str) or re.search(r"\s", key):
                    problems.append(f"{here}: key is not a plain token (a comma split probably produced it)")
                if value is None and not is_data:
                    problems.append(f"{here}: null value in a structural position")
                if names:  # `key` is a name chosen by the author; `value` is the object it names
                    walk(value, here)
                    continue
                if key in ("description", "summary"):
                    check_text(path, key, value)
                if not is_data:
                    walk(value, here, names=key in NAME_MAPS and isinstance(value, dict))
        elif isinstance(node, list):
            for index, item in enumerate(node):
                if item is None:
                    problems.append(f"{path}[{index}]: null item in a structural position")
                walk(item, f"{path}[{index}]")

    walk(document, "")
    return problems


# JSON Schema 2020-12 keywords plus the OpenAPI 3.1 additions. Anything else (other than `x-*`) in a schema object is a typo
# or a split plain scalar. `nullable` is OpenAPI 3.0 only: 3.1 expresses it with `type: 'null'`.
SCHEMA_KEYWORDS = {
    "$ref", "$id", "$schema", "$anchor", "$comment", "$defs", "$dynamicRef", "$dynamicAnchor", "$vocabulary",
    "type", "enum", "const", "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
    "maxLength", "minLength", "pattern", "maxItems", "minItems", "uniqueItems", "maxContains", "minContains",
    "maxProperties", "minProperties", "required", "dependentRequired", "allOf", "anyOf", "oneOf", "not", "if", "then",
    "else", "dependentSchemas", "prefixItems", "items", "contains", "properties", "patternProperties",
    "additionalProperties", "propertyNames", "unevaluatedItems", "unevaluatedProperties", "format", "contentEncoding",
    "contentMediaType", "contentSchema", "title", "description", "default", "deprecated", "readOnly", "writeOnly",
    "examples", "discriminator", "xml", "externalDocs", "example",
}
SUBSCHEMA_VALUE_KEYS = ("properties", "patternProperties", "$defs", "dependentSchemas")
SUBSCHEMA_KEYS = ("items", "not", "if", "then", "else", "contains", "propertyNames", "additionalProperties",
                  "unevaluatedItems", "unevaluatedProperties", "contentSchema")
SUBSCHEMA_LIST_KEYS = ("allOf", "anyOf", "oneOf", "prefixItems")


def child_schemas(schema: dict[str, Any]) -> Iterator[tuple[str, Any]]:
    for key in SUBSCHEMA_VALUE_KEYS:
        if isinstance(schema.get(key), dict):
            for name, child in schema[key].items():
                yield f"{key}/{name}", child
    for key in SUBSCHEMA_KEYS:
        if isinstance(schema.get(key), dict):
            yield key, schema[key]
    for key in SUBSCHEMA_LIST_KEYS:
        if isinstance(schema.get(key), list):
            for index, child in enumerate(schema[key]):
                yield f"{key}[{index}]", child


def all_schemas(document: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    """Every schema object: component schemas plus those on parameters, headers and media types, recursively."""
    roots: list[tuple[str, Any]] = [(f"components/schemas/{n}", s) for n, s in document.get("components", {}).get("schemas", {}).items()]

    def from_media(where: str, content: dict[str, Any]) -> None:
        for media_type, media in content.items():
            if "schema" in media:
                roots.append((f"{where}/{media_type}", media["schema"]))

    def from_parameter_like(where: str, obj: dict[str, Any]) -> None:
        if "schema" in obj:
            roots.append((f"{where}/schema", obj["schema"]))
        from_media(where, obj.get("content", {}))

    def from_response(where: str, response: dict[str, Any]) -> None:
        for name, header in response.get("headers", {}).items():
            from_parameter_like(f"{where}/headers/{name}", header)
        from_media(where, response.get("content", {}))

    components = document.get("components", {})
    for name, response in components.get("responses", {}).items():
        from_response(f"components/responses/{name}", response)
    for name, param in components.get("parameters", {}).items():
        from_parameter_like(f"components/parameters/{name}", param)
    for name, header in components.get("headers", {}).items():
        from_parameter_like(f"components/headers/{name}", header)
    for path, method, op in operations(document):
        where = f"{method.upper()} {path}"
        for param in op.get("parameters", []):
            if "name" in param:
                from_parameter_like(f"{where} parameter {param['name']}", param)
        from_media(f"{where} request", op.get("requestBody", {}).get("content", {}))
        for status, response in op["responses"].items():
            if "content" in response or "headers" in response:
                from_response(f"{where} {status}", response)

    def descend(where: str, schema: Any) -> Iterator[tuple[str, dict[str, Any]]]:
        if isinstance(schema, dict):
            yield where, schema
            for name, child in child_schemas(schema):
                yield from descend(f"{where}/{name}", child)

    for where, schema in roots:
        yield from descend(where, schema)


def schema_keyword_problems(document: dict[str, Any]) -> list[str]:
    return [
        f"{where}: unknown schema keyword {key!r}"
        for where, schema in all_schemas(document)
        for key in schema
        if key not in SCHEMA_KEYWORDS and not str(key).startswith("x-")
    ]


# --------------------------------------------------------------------------- every example in the document


def collect_examples(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Every ``example`` / ``examples`` value with the schema it must satisfy and whether it is a request body."""
    found: list[dict[str, Any]] = []

    def add(where: str, schema: Any, value: Any, request: bool = False) -> None:
        found.append({"where": where, "schema": schema, "value": value, "request": request})

    def media_examples(where: str, content: dict[str, Any], request: bool) -> None:
        for media_type, media in content.items():
            if "example" in media:
                add(f"{where} {media_type} example", media.get("schema", {}), media["example"], request)
            for name, example in media.get("examples", {}).items():
                example = resolve(document, example)
                assert "externalValue" not in example, f"{where} {name}: externalValue examples cannot be validated here"
                add(f"{where} {media_type} examples.{name}", media.get("schema", {}), example["value"], request)

    def parameter_like(where: str, obj: dict[str, Any]) -> None:
        obj = resolve(document, obj)
        if "example" in obj:
            add(f"{where} example", obj.get("schema", {}), obj["example"])
        for name, example in obj.get("examples", {}).items():
            add(f"{where} examples.{name}", obj.get("schema", {}), resolve(document, example)["value"])
        media_examples(where, obj.get("content", {}), False)

    components = document.get("components", {})
    for name, response in components.get("responses", {}).items():
        media_examples(f"components/responses/{name}", response.get("content", {}), False)
        for header, obj in response.get("headers", {}).items():
            parameter_like(f"components/responses/{name} header {header}", obj)
    for name, param in components.get("parameters", {}).items():
        parameter_like(f"components/parameters/{name}", param)
    for name, header in components.get("headers", {}).items():
        parameter_like(f"components/headers/{name}", header)
    for path, method, op in operations(document):
        where = f"{method.upper()} {path}"
        for param in op.get("parameters", []):
            parameter_like(f"{where} parameter {resolve(document, param)['name']}", param)
        media_examples(f"{where} request", op.get("requestBody", {}).get("content", {}), True)
        for status, response in op["responses"].items():
            response = resolve(document, response)
            media_examples(f"{where} {status}", response.get("content", {}), False)
            for header, obj in response.get("headers", {}).items():
                parameter_like(f"{where} {status} header {header}", obj)
    for where, schema in all_schemas(document):
        own = {key: value for key, value in schema.items() if key not in ("examples", "example")}
        if "example" in schema:
            add(f"schema {where} example", own, schema["example"])
        if isinstance(schema.get("examples"), list):
            for index, value in enumerate(schema["examples"]):
                add(f"schema {where} examples[{index}]", own, value)
    return found


def example_problems(document: dict[str, Any]) -> list[str]:
    registry = Registry().with_resource(BASE, Resource.from_contents(document, default_specification=DRAFT202012))
    problems = []
    for example in collect_examples(document):
        for error in schema_errors(registry, example["schema"], example["value"]):
            problems.append(f"{example['where']}: {error}")
        if example["request"] and trimmed(document, example["schema"], example["value"]) != example["value"]:
            problems.append(f"{example['where']}: request examples must be written already trimmed (the schema describes the trimmed value)")
    return problems


# --------------------------------------------------------------------------- tests


@pytest.fixture(scope="module")
def text() -> str:
    return SPEC_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def document(text: str) -> dict[str, Any]:
    return yaml.safe_load(text)


def test_yaml_has_no_duplicate_keys_or_empty_values(text: str) -> None:
    assert yaml_problems(text) == []


def test_no_null_in_a_structural_position_and_no_blank_or_truncated_description(document: dict[str, Any]) -> None:
    assert structure_problems(document) == []


def test_every_schema_object_uses_only_known_keywords(document: dict[str, Any]) -> None:
    problems = schema_keyword_problems(document)
    assert problems == []
    assert len(list(all_schemas(document))) > 150  # the walk really reaches nested and inline schemas


def test_known_flow_mapping_descriptions_are_not_truncated(document: dict[str, Any]) -> None:
    schemas = document["components"]["schemas"]
    # The defect QA found: an unquoted comma cut this sentence and published a junk `safe to show to the user.` key.
    assert schemas["Error"]["properties"]["message"] == {"type": "string", "description": "Human-readable, safe to show to the user."}
    assert schemas["AssetInput"]["properties"]["description"]["description"] == "Required but may be empty."
    assert schemas["Asset"]["properties"]["description"]["description"] == "May be empty."
    assert schemas["StaffBooking"]["properties"]["borrower"]["description"] == "The owner's username."
    assert document["components"]["headers"]["Allow"]["schema"]["examples"] == ["GET, HEAD"]


def test_every_example_in_the_document_is_valid_exactly_as_written(document: dict[str, Any]) -> None:
    examples = collect_examples(document)
    assert len(examples) >= 60, "media-type, parameter, header and schema examples are all collected"
    assert any(e["request"] for e in examples) and any("schema components" in e["where"] or e["where"].startswith("schema ") for e in examples)
    assert example_problems(document) == []
    # The self-invalid example QA found: a padded username only validates after trimming, which a linter or mock server never does.
    register = document["paths"]["/api/v1/auth/register"]["post"]["requestBody"]["content"]["application/json"]["examples"]["newStudent"]["value"]
    assert register["username"] == register["username"].strip()


def test_format_checking_is_live_so_example_formats_are_really_enforced() -> None:
    assert {"date", "date-time"} <= set(Draft202012Validator.FORMAT_CHECKER.checkers), "install rfc3339-validator (via openapi-spec-validator)"
