import type { Response } from 'express'

/**
 * CSV export shared by the report pages and the finance lists.
 *
 * Every export is the same three steps — columns, rows, attachment headers — so
 * they live in one place and two exports can never disagree on quoting or on
 * the BOM Excel needs.
 */

export type CsvValue = string | number | boolean | Date | null | undefined

export interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvValue
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  // Quote only what would otherwise break the row apart.
  return /[",\n\r;]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}

export function toCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  const lines = [columns.map(column => csvCell(column.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map(column => csvCell(column.value(row))).join(','))
  }
  return lines.join('\r\n')
}

/**
 * Send a CSV the way a spreadsheet expects one.
 *
 * The BOM is not decoration: without it Excel reads the file in the system
 * codepage and every Cyrillic heading arrives as mojibake. CRLF is what the
 * format specifies and what older spreadsheet tools still require.
 */
export function sendCsv<T>(
  res: Response,
  filename: string,
  columns: Array<CsvColumn<T>>,
  rows: T[]
) {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`)
  return res.send('﻿' + toCsv(columns, rows))
}
