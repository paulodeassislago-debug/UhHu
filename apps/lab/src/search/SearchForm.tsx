// apps/lab — formulário de estratégia de busca fiel ao esqueleto §6 (D-09/D-10, UI-13, 07-02 task 1).
//
// `SearchForm({ projectId, initial, sourcesHealth, onSave, onSaveAndRun, saving })`:
// componente controlado que monta a busca em linhas AND/OR/NOT (SEM expressão
// livre — D-09) e compõe o único `term` do contrato via buildSearchTerm (D-31:
// nenhum campo novo no contrato — FASE 7 NÃO MUDA CONTRATO).
// - Termos: FlatList aninhada (scrollEnabled=false) de rows {text, op}; primeira
//   sem seletor de op; demais com 3 botões AND/OR/NOT; "+" adiciona, "×" remove
//   (mínimo 1).
// - Filtros §6: Ano de/até (opcional), Tipo tese/dissertacão, Área/Instituição/
//   Programa (opcionais, pós-filtro Core quando a fonte não honra).
// - Mapeamento UI→contrato: tese → 'doctoralThesis', dissertação → 'masterThesis' (sem inverter).
// - Fontes: toggles BDTD/CAPES (mínimo 1; default ambas) + selo fixo
//   "filtro garantido pelo Core (pós-filtro)" + status por fonte via prop.
// - CTAs: "Salvar estratégia" → onSave(payload), "Executar agora" →
//   onSaveAndRun(payload); payload = {term, filters, sources}. Validação local:
//   termo vazio ou `createSearchSchema.parse` falho → erro PT-BR na tela, sem API.
// Guards são UX; autorização real continua no CORE (AGENTS.md). Text escapa por
// padrão; sem WebView; sem eval.

import { useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { ZodError } from 'zod';
import { createSearchSchema } from '@uhhu/contracts';
import type { ExecutableSource, SearchFilters } from '@uhhu/contracts';
import { buildSearchTerm, splitSearchTerm } from './searchTerm';
import type { TermOperator, TermRow } from './searchTerm';

export interface SearchFormInitial {
  term: string;
  filters: SearchFilters;
  sources: ExecutableSource[];
}

export interface SearchFormPayload {
  term: string;
  filters: SearchFilters;
  sources: ExecutableSource[];
}

export interface SourceHealthLabels {
  bdtd: string;
  capes: string;
}

export interface SearchFormProps {
  projectId: string;
  initial?: SearchFormInitial;
  sourcesHealth: SourceHealthLabels;
  onSave: (payload: SearchFormPayload) => void | Promise<void>;
  onSaveAndRun: (payload: SearchFormPayload) => void | Promise<void>;
  saving: boolean;
}

const OPERATORS: TermOperator[] = ['AND', 'OR', 'NOT'];

function firstZodMessage(error: ZodError): string {
  const flat = error.flatten();
  const fieldErrors: Record<string, string[] | undefined> = flat.fieldErrors;
  for (const key of Object.keys(fieldErrors)) {
    const msgs: string[] | undefined = fieldErrors[key];
    if (msgs !== undefined && msgs.length > 0) {
      const first: string | undefined = msgs[0];
      if (typeof first === 'string' && first.length > 0) {
        return first;
      }
    }
  }
  if (flat.formErrors.length > 0) {
    const first: string | undefined = flat.formErrors[0];
    if (typeof first === 'string' && first.length > 0) {
      return first;
    }
  }
  return 'Dados inválidos. Verifique os campos.';
}

function parseYear(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d{1,4}$/.test(trimmed)) {
    return 'invalid';
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value < 1800 || value > 2100) {
    return 'invalid';
  }
  return value;
}

export function SearchForm({
  projectId,
  initial,
  sourcesHealth,
  onSave,
  onSaveAndRun,
  saving,
}: SearchFormProps): JSX.Element {
  const [rows, setRows] = useState<TermRow[]>(() => {
    if (initial === undefined || initial.term.trim().length === 0) {
      return [{ text: '', op: 'AND' }];
    }
    return splitSearchTerm(initial.term);
  });
  const [yearFrom, setYearFrom] = useState<string>(
    initial?.filters.yearFrom !== undefined ? String(initial.filters.yearFrom) : '',
  );
  const [yearTo, setYearTo] = useState<string>(
    initial?.filters.yearTo !== undefined ? String(initial.filters.yearTo) : '',
  );
  const [tese, setTese] = useState<boolean>(
    initial?.filters.docTypes?.includes('doctoralThesis') ?? false,
  );
  const [dissertacao, setDissertacao] = useState<boolean>(
    initial?.filters.docTypes?.includes('masterThesis') ?? false,
  );
  const [area, setArea] = useState<string>(initial?.filters.area ?? '');
  const [institution, setInstitution] = useState<string>(initial?.filters.institution ?? '');
  const [program, setProgram] = useState<string>(initial?.filters.program ?? '');
  const [bdtd, setBdtd] = useState<boolean>(initial?.sources.includes('bdtd') ?? true);
  const [capes, setCapes] = useState<boolean>(initial?.sources.includes('capes') ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  function updateRowText(index: number, text: string): void {
    setRows((prev: TermRow[]): TermRow[] =>
      prev.map((row: TermRow, i: number): TermRow =>
        i === index ? { text, op: row.op } : row,
      ),
    );
  }

  function updateRowOp(index: number, op: TermOperator): void {
    setRows((prev: TermRow[]): TermRow[] =>
      prev.map((row: TermRow, i: number): TermRow =>
        i === index ? { text: row.text, op } : row,
      ),
    );
  }

  function handleAddRow(): void {
    setRows((prev: TermRow[]): TermRow[] => [...prev, { text: '', op: 'AND' }]);
  }

  function handleRemoveRow(index: number): void {
    setRows((prev: TermRow[]): TermRow[] => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_: TermRow, i: number): boolean => i !== index);
    });
  }

  function buildPayload(): SearchFormPayload | null {
    const term = buildSearchTerm(rows);
    if (term.length === 0) {
      setFormError('Informe ao menos um termo de busca.');
      return null;
    }
    const from = parseYear(yearFrom);
    if (from === 'invalid') {
      setFormError('Ano inicial deve ser um ano entre 1800 e 2100.');
      return null;
    }
    const to = parseYear(yearTo);
    if (to === 'invalid') {
      setFormError('Ano final deve ser um ano entre 1800 e 2100.');
      return null;
    }
    const docTypes: Array<'doctoralThesis' | 'masterThesis'> = [];
    if (tese) {
      docTypes.push('doctoralThesis');
    }
    if (dissertacao) {
      docTypes.push('masterThesis');
    }
    const sources: ExecutableSource[] = [];
    if (bdtd) {
      sources.push('bdtd');
    }
    if (capes) {
      sources.push('capes');
    }
    if (sources.length === 0) {
      setFormError('Selecione ao menos uma fonte (BDTD ou CAPES).');
      return null;
    }
    const filters: SearchFilters = {
      ...(from !== null ? { yearFrom: from } : {}),
      ...(to !== null ? { yearTo: to } : {}),
      ...(docTypes.length > 0 ? { docTypes } : {}),
      ...(area.trim().length > 0 ? { area: area.trim() } : {}),
      ...(institution.trim().length > 0 ? { institution: institution.trim() } : {}),
      ...(program.trim().length > 0 ? { program: program.trim() } : {}),
    };
    try {
      createSearchSchema.parse({ projectId, term, filters, sources });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        setFormError(firstZodMessage(error));
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError('Dados inválidos. Verifique os campos.');
      }
      return null;
    }
    setFormError(null);
    return { term, filters, sources };
  }

  function handleSave(): void {
    const payload = buildPayload();
    if (payload === null) {
      return;
    }
    void onSave(payload);
  }

  function handleSaveAndRun(): void {
    const payload = buildPayload();
    if (payload === null) {
      return;
    }
    void onSaveAndRun(payload);
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Termos/descritores</Text>
      <FlatList
        data={rows}
        keyExtractor={(_row: TermRow, index: number): string => `row-${index}`}
        scrollEnabled={false}
        renderItem={({ item: row, index }: ListRenderItemInfo<TermRow>): JSX.Element => (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {index === 0 ? null : (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {OPERATORS.map((op: TermOperator): JSX.Element => (
                  <Button
                    key={op}
                    title={op === row.op ? `[${op}]` : op}
                    onPress={() => updateRowOp(index, op)}
                    disabled={saving || op === row.op}
                  />
                ))}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <TextInput
                value={row.text}
                onChangeText={(text: string): void => updateRowText(index, text)}
                placeholder={index === 0 ? 'ex.: ensino de química' : 'ex.: gamificação'}
                maxLength={500}
                editable={!saving}
              />
            </View>
            <Button
              title="×"
              onPress={() => handleRemoveRow(index)}
              disabled={saving || rows.length <= 1}
            />
          </View>
        )}
      />
      <Button title="+ Adicionar linha" onPress={handleAddRow} disabled={saving} />

      <Text style={{ fontSize: 18, fontWeight: '600' }}>Filtros</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text>Ano:</Text>
        <TextInput
          value={yearFrom}
          onChangeText={setYearFrom}
          placeholder="de (ex.: 2020)"
          keyboardType="numeric"
          maxLength={4}
          editable={!saving}
        />
        <Text>—</Text>
        <TextInput
          value={yearTo}
          onChangeText={setYearTo}
          placeholder="até (ex.: 2025)"
          keyboardType="numeric"
          maxLength={4}
          editable={!saving}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text>Tipo:</Text>
        <Button
          title={tese ? '[x] tese' : '[ ] tese'}
          onPress={() => setTese((prev: boolean): boolean => !prev)}
          disabled={saving}
        />
        <Button
          title={dissertacao ? '[x] dissertação' : '[ ] dissertação'}
          onPress={() => setDissertacao((prev: boolean): boolean => !prev)}
          disabled={saving}
        />
      </View>
      <TextInput
        value={area}
        onChangeText={setArea}
        placeholder="Área (opcional)"
        maxLength={200}
        editable={!saving}
      />
      <TextInput
        value={institution}
        onChangeText={setInstitution}
        placeholder="Instituição (opcional)"
        maxLength={300}
        editable={!saving}
      />
      <TextInput
        value={program}
        onChangeText={setProgram}
        placeholder="Programa (opcional)"
        maxLength={300}
        editable={!saving}
      />

      <Text style={{ fontSize: 18, fontWeight: '600' }}>Fontes</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button
          title={bdtd ? '(x) BDTD' : '( ) BDTD'}
          onPress={() => setBdtd((prev: boolean): boolean => !prev)}
          disabled={saving}
        />
        <Button
          title={capes ? '(x) CAPES' : '( ) CAPES'}
          onPress={() => setCapes((prev: boolean): boolean => !prev)}
          disabled={saving}
        />
      </View>
      <Text>BDTD: {sourcesHealth.bdtd}</Text>
      <Text>CAPES: {sourcesHealth.capes}</Text>
      <Text style={{ fontSize: 12 }}>filtro garantido pelo Core (pós-filtro)</Text>

      {formError !== null ? <Text style={{ color: '#dc2626' }}>{formError}</Text> : null}
      <Button
        title={saving ? 'Salvando…' : 'Salvar estratégia'}
        onPress={handleSave}
        disabled={saving}
      />
      <Button
        title={saving ? 'Executando…' : 'Executar agora'}
        onPress={handleSaveAndRun}
        disabled={saving}
      />
    </View>
  );
}
