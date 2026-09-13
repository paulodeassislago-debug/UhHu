// apps/lab — modal de criação de projeto (D-13, UI-10, 07-01 task 1).
//
// `ProjectModal({ visible, onClose, onCreated, getToken })`: React Native
// `Modal` (transparent, animationType slide) + card central com dois campos —
// Título (obrigatório, maxLength 200) e Pergunta de pesquisa (opcional,
// multiline, maxLength 2000). Valida no submit com
// `createProjectSchema.parse({ title: title.trim(), researchQuestion:
// question.trim().length > 0 ? question.trim() : undefined })` e exibe a
// primeira mensagem Zod (flatten fieldErrors) em texto vermelho acima dos
// botões. Botões: "Criar projeto" (chama `projectsApi.create(parsed,
// { getToken })`, fecha e chama onCreated(created)) e "Cancelar". Erro de API
// (ApiError) exibido verbatim (message + requestId caption). Título/pergunta
// são input hostil: client valida por UX, servidor revalida via Zod (T-07-01-01);
// trim + maxLength nos inputs. React Native escapa Text por padrão; sem
// dangerouslySetInnerHTML/WebView; sem eval (T-07-01-04).

import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Modal, Text, TextInput, View } from 'react-native';
import { ZodError } from 'zod';
import { createProjectSchema } from '@uhhu/contracts';
import type { CreateProjectInput, ProjectDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { projectsApi } from '../api/projects';

export interface ProjectModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (created: ProjectDTO) => void;
  getToken?: TokenProvider;
}

function firstZodMessage(error: ZodError): string {
  const flat = error.flatten();
  const fieldValues: unknown = (flat as { fieldErrors: Record<string, unknown> }).fieldErrors;
  if (typeof fieldValues === 'object' && fieldValues !== null) {
    const entries = Object.values(fieldValues as Record<string, unknown>);
    for (const msgs of entries) {
      if (Array.isArray(msgs) && msgs.length > 0) {
        const first: unknown = msgs[0];
        if (typeof first === 'string' && first.length > 0) {
          return first;
        }
      }
    }
  }
  const formErrors: unknown = (flat as { formErrors: unknown }).formErrors;
  if (Array.isArray(formErrors) && formErrors.length > 0) {
    const first: unknown = formErrors[0];
    if (typeof first === 'string' && first.length > 0) {
      return first;
    }
  }
  return 'Dados inválidos. Verifique os campos.';
}

export function ProjectModal({
  visible,
  onClose,
  onCreated,
  getToken,
}: ProjectModalProps): JSX.Element {
  const [title, setTitle] = useState<string>('');
  const [question, setQuestion] = useState<string>('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [apiRequestId, setApiRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  function handleClose(): void {
    if (submitting) {
      return;
    }
    setFieldError(null);
    setApiMessage(null);
    setApiRequestId(null);
    onClose();
  }

  async function handleCreate(): Promise<void> {
    setFieldError(null);
    setApiMessage(null);
    setApiRequestId(null);
    let parsed: CreateProjectInput;
    try {
      parsed = createProjectSchema.parse({
        title: title.trim(),
        researchQuestion: question.trim().length > 0 ? question.trim() : undefined,
      });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        setFieldError(firstZodMessage(error));
      } else if (error instanceof Error) {
        setFieldError(error.message);
      } else {
        setFieldError('Dados inválidos. Verifique os campos.');
      }
      return;
    }
    setSubmitting(true);
    try {
      const created: ProjectDTO =
        getToken !== undefined
          ? await projectsApi.create(parsed, { getToken })
          : await projectsApi.create(parsed);
      setTitle('');
      setQuestion('');
      setFieldError(null);
      onCreated(created);
      onClose();
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setApiMessage(error.message);
        setApiRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof Error) {
        setApiMessage(error.message);
        setApiRequestId(null);
      } else {
        setApiMessage('Erro interno. Tente novamente.');
        setApiRequestId(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <View style={{ backgroundColor: '#ffffff', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600' }}>Novo projeto</Text>
          <Text>Título</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Título do projeto"
            maxLength={200}
            editable={!submitting}
          />
          <Text>Pergunta de pesquisa (opcional)</Text>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Pergunta de pesquisa"
            multiline
            maxLength={2000}
            editable={!submitting}
          />
          {fieldError !== null ? <Text style={{ color: '#dc2626' }}>{fieldError}</Text> : null}
          {apiMessage !== null ? <Text style={{ color: '#dc2626' }}>{apiMessage}</Text> : null}
          {apiRequestId !== null ? (
            <Text style={{ fontSize: 12 }}>(req {apiRequestId})</Text>
          ) : null}
          <Button
            title={submitting ? 'Criando…' : 'Criar projeto'}
            onPress={() => void handleCreate()}
            disabled={submitting}
          />
          <Button title="Cancelar" onPress={handleClose} disabled={submitting} />
        </View>
      </View>
    </Modal>
  );
}
