import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNpr(amount: number): string {
  if (amount >= 10000000) {
    const crore = amount / 10000000;
    const display = crore % 1 === 0 ? crore.toFixed(0) : crore.toFixed(1);
    return `NPR ${display} crore`;
  }
  const lakh = Math.round(amount / 100000);
  return `NPR ${lakh} lakh`;
}

export function formatUsd(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `USD ${k}k`;
  }
  return `USD ${amount}`;
}

export function yearsBetween(pastYear: number, reference?: number): number {
  const ref = reference ?? new Date().getFullYear();
  return Math.max(0, ref - pastYear);
}
