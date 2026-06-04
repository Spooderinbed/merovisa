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

const PARSERS: Partial<Record<DocumentKind, Parser>> = {
  ielts: parseIelts,
  pte: parsePte,
  toefl: parseToefl,
  passport: parsePassport,
  "bachelors-transcript": parseTranscript,
  "bank-statement": parseBankStatement,
  "employment-letter": parseEmploymentLetter,
  "salary-slip": parseSalarySlip,
  "offer-letter": parseOfferLetter,
};

export function getParser(kind: DocumentKind): Parser | null {
  return PARSERS[kind] ?? null;
}
