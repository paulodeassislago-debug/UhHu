// apps/lab — modal de gestão de tags (08-04, UI-20, D-21).
//
// `TagManagerModal({ visible, projectId, getToken, onClose, onTagsChanged })`
// (molde ProjectModal: Modal transparent, validação local, erro verbatim sem
// fechar): FlatList das tags (keyExtractor id — sem `.map` de lista); cada
// linha: TextInput do nome + [Salvar] (nada muda → sem request; vazio/overlong
// → erro local sem request, molde 07-06) → `renameProjectTag` (400 colisão →
// mensagem verbatim na linha); [Excluir] two-tap ([Excluir]→[Confirmar?]) →
// `deleteProjectTag` + remove a linha; rodapé: input nome + input cor opcional
// (texto ≤20, sem color-picker — fora do v1) + [Criar] → `createProjectTag`.
// Qualquer mutação com sucesso atualiza a lista local + chama `onTagsChanged`
// (a tela recarrega o estado canônico); fechar (X ou voltar) também chama
// `onTagsChanged` quando houve mutação (refresh idempotente). 401 →
// markExpired + login. Text escapa; sem WebView. Sem `any`.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, FlatList, Modal, Text, TextInput, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import type { ProjectTag } from '../api/lab';
import { useAuth } from '../auth/session';
import { ErrorBanner } from '../ui/ErrorBanner';
import { CardSkeleton } from '../ui/Skeleton';

export interface TagManagerModalProps {
  visible: boolean;
  projectId: string;
  getToken: TokenProvider;
  onClose: () => void;
  onTagsChanged: () => void;
}

function toBanner(unknownError: unknown): { message: string; requestId: string | null } {
  if (unknownError instanceof ApiError) {
    return {
      message: unknownError.message,
      requestId: unknownError.requestId !== '' ? unknownError.requestId : null,
    };
  }
  if (unknownError instanceof Error) {
    return { message: unknownError.message, requestId: null };
  }
  return { message: 'Erro interno. Tente novamente.', requestId: null };
}

export function TagManagerModal({
  visible,
  projectId,
  getToken,
  onClose,
  onTagsChanged,
}: TagManagerModalProps): JSX.Element {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [tags, setTags] = useState<ProjectTag[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(
    null,
  );
  const [editNames, setEditNames] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [busySave, setBusySave] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [createName, setCreateName] = useState<string>('');
  const [createColor, setCreateColor] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyCreate, setBusyCreate] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);

  function handleUnauthorized(): void {
    markExpired();
    router.replace({ pathname: '/login', params: { expired: '1' } });
  }

  async function loadTags(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const list: ProjectTag[] = await labApi.listProjectTags(projectId, { getToken });
      setTags(list);
      const nextEdits: Record<string, string> = {};
      for (const entry of list) {
        nextEdits[entry.id] = entry.name;
      }
      setEditNames(nextEdits);
      setLineErrors({});
      setConfirmDelete(null);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setLoadError(toBanner(unknownError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) {
      setDirty(false);
      setCreateName('');
      setCreateColor('');
      setCreateError(null);
      void loadTags();
    }
  }, [visible, projectId]);

  function handleClose(): void {
    if (loading || busySave !== null || busyDelete !== null || busyCreate) {
      return;
    }
    setConfirmDelete(null);
    onClose();
    if (dirty) {
      onTagsChanged();
    }
  }

  function handleEditChange(tagId: string, text: string): void {
    const next: Record<string, string> = { ...editNames };
    next[tagId] = text;
    setEditNames(next);
  }

  async function handleSave(tag: ProjectTag): Promise<void> {
    if (busySave !== null || busyDelete !== null || busyCreate) {
      return;
    }
    const edited: string = (editNames[tag.id] ?? tag.name).trim();
    if (edited === tag.name) {
      const nextErrors: Record<string, string> = { ...lineErrors };
      delete nextErrors[tag.id];
      setLineErrors(nextErrors);
      return;
    }
    if (edited.length === 0) {
      setLineErrors({ ...lineErrors, [tag.id]: 'Nome da tag é obrigatório.' });
      return;
    }
    if (edited.length > 100) {
      setLineErrors({ ...lineErrors, [tag.id]: 'Nome deve ter no máximo 100 caracteres.' });
      return;
    }
    setBusySave(tag.id);
    const cleared: Record<string, string> = { ...lineErrors };
    delete cleared[tag.id];
    setLineErrors(cleared);
    try {
      const renamed: ProjectTag = await labApi.renameProjectTag(
        projectId,
        tag.id,
        { name: edited },
        { getToken },
      );
      const nextTags: ProjectTag[] = [];
      if (tags !== null) {
        for (const entry of tags) {
          nextTags.push(entry.id === tag.id ? renamed : entry);
        }
      }
      setTags(nextTags);
      setEditNames({ ...editNames, [tag.id]: renamed.name });
      setDirty(true);
      onTagsChanged();
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setLineErrors({ ...lineErrors, [tag.id]: toBanner(unknownError).message });
    } finally {
      setBusySave(null);
    }
  }

  function handleSavePress(tag: ProjectTag): void {
    void handleSave(tag);
  }

  async function handleDelete(tag: ProjectTag): Promise<void> {
    if (busySave !== null || busyDelete !== null || busyCreate) {
      return;
    }
    if (confirmDelete !== tag.id) {
      setConfirmDelete(tag.id);
      return;
    }
    setBusyDelete(tag.id);
    try {
      await labApi.deleteProjectTag(projectId, tag.id, { getToken });
      const nextTags: ProjectTag[] = [];
      if (tags !== null) {
        for (const entry of tags) {
          if (entry.id !== tag.id) {
            nextTags.push(entry);
          }
        }
      }
      setTags(nextTags);
      const nextEdits: Record<string, string> = { ...editNames };
      delete nextEdits[tag.id];
      setEditNames(nextEdits);
      const nextErrors: Record<string, string> = { ...lineErrors };
      delete nextErrors[tag.id];
      setLineErrors(nextErrors);
      setConfirmDelete(null);
      setDirty(true);
      onTagsChanged();
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setLineErrors({ ...lineErrors, [tag.id]: toBanner(unknownError).message });
    } finally {
      setBusyDelete(null);
    }
  }

  function handleDeletePress(tag: ProjectTag): void {
    void handleDelete(tag);
  }

  async function handleCreate(): Promise<void> {
    if (busyCreate || busySave !== null || busyDelete !== null) {
      return;
    }
    setCreateError(null);
    const name: string = createName.trim();
    if (name.length === 0) {
      setCreateError('Nome da tag é obrigatório.');
      return;
    }
    if (name.length > 100) {
      setCreateError('Nome deve ter no máximo 100 caracteres.');
      return;
    }
    const color: string = createColor.trim();
    if (color.length > 20) {
      setCreateError('Cor deve ter no máximo 20 caracteres.');
      return;
    }
    setBusyCreate(true);
    try {
      const created: ProjectTag = await labApi.createProjectTag(
        projectId,
        color.length > 0 ? { name, color } : { name },
        { getToken },
      );
      const nextTags: ProjectTag[] = [];
      if (tags !== null) {
        for (const entry of tags) {
          nextTags.push(entry);
        }
      }
      nextTags.push(created);
      setTags(nextTags);
      setEditNames({ ...editNames, [created.id]: created.name });
      setCreateName('');
      setCreateColor('');
      setDirty(true);
      onTagsChanged();
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setCreateError(toBanner(unknownError).message);
    } finally {
      setBusyCreate(false);
    }
  }

  function handleCreatePress(): void {
    void handleCreate();
  }

  function handleRetryLoad(): void {
    void loadTags();
  }

  function renderRow({ item }: ListRenderItemInfo<ProjectTag>): JSX.Element {
    const draft: string = editNames[item.id] ?? item.name;
    const lineError: string | undefined = lineErrors[item.id];
    const saving: boolean = busySave === item.id;
    const deleting: boolean = busyDelete === item.id;
    const armed: boolean = confirmDelete === item.id;
    return (
      <View style={{ gap: 4, borderWidth: 1, padding: 8 }}>
        <TextInput
          value={draft}
          onChangeText={(text: string): void => handleEditChange(item.id, text)}
          placeholder="nome da tag"
          editable={!saving && !deleting}
          style={{ borderWidth: 1, padding: 8 }}
        />
        {typeof lineError === 'string' ? (
          <Text style={{ color: '#dc2626' }}>{lineError}</Text>
        ) : null}
        <Button
          title={saving ? 'Salvando…' : 'Salvar'}
          onPress={() => handleSavePress(item)}
          disabled={saving || deleting}
        />
        <Button
          title={deleting ? 'Excluindo…' : armed ? 'Confirmar?' : 'Excluir'}
          onPress={() => handleDeletePress(item)}
          disabled={saving || deleting}
        />
      </View>
    );
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
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Gerenciar tags</Text>
            <Button title="X" onPress={handleClose} />
          </View>
          {loading && tags === null ? <CardSkeleton count={2} /> : null}
          {loadError !== null && tags === null ? (
            <ErrorBanner
              message={loadError.message}
              requestId={loadError.requestId}
              onRetry={handleRetryLoad}
            />
          ) : null}
          {tags !== null ? (
            <FlatList
              data={tags}
              keyExtractor={(entry: ProjectTag): string => entry.id}
              renderItem={renderRow}
              contentContainerStyle={{ gap: 8 }}
              ListEmptyComponent={<Text>Nenhuma tag — crie abaixo.</Text>}
            />
          ) : null}
          <View style={{ gap: 4 }}>
            <Text style={{ fontWeight: '600' }}>Nova tag</Text>
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="nome da tag"
              editable={!busyCreate}
              style={{ borderWidth: 1, padding: 8 }}
            />
            <TextInput
              value={createColor}
              onChangeText={setCreateColor}
              placeholder="cor opcional (ex. vermelho)"
              editable={!busyCreate}
              style={{ borderWidth: 1, padding: 8 }}
            />
            {createError !== null ? <Text style={{ color: '#dc2626' }}>{createError}</Text> : null}
            <Button
              title={busyCreate ? 'Criando…' : 'Criar'}
              onPress={handleCreatePress}
              disabled={busyCreate}
            />
          </View>
          <Button title="Fechar" onPress={handleClose} />
        </View>
      </View>
    </Modal>
  );
}
