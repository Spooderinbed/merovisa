import type { DocumentKind } from "../types";
import { parseIelts } from "./ielts";
import { parsePte } from "./pte";
import { parseToefl } from "./toefl";
import { parsePassport } from "./passport";
import { parseTranscript } from "./transcript";
import { parseBankStatement } from "./bank-statement";
import { parseEmploymentLetter } from "./employment-letter";
import { parseSalarySlip } from "./salary-slip";
import { parseOfferLetter } from "./offer-letter";

type ParseResult = Record<string, unknown> | null;
type Parser = (rawText: string) => ParseResult;

// Cast each parser to the generic Parser type to satisfy the index signature requirement.
const PARSERS: Partial<Record<DocumentKind, Parser>> = {
  ielts: parseIelts as Parser,
  pte: parsePte as Parser,
  toefl: parseToefl as Parser,
  passport: parsePassport as Parser,
  "bachelors-transcript": parseTranscript as Parser,
  "bank-statement": parseBankStatement as Parser,
  "employment-letter": parseEmploymentLetter as Parser,
  "salary-slip": parseSalarySlip as Parser,
  "offer-letter": parseOfferLetter as Parser,
};

export function getParser(kind: DocumentKind): Parser | null {
  return PARSERS[kind] ?? null;
}
