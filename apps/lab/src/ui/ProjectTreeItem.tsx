// apps/lab — item da árvore de projetos da sidebar W1 (spec §3/§4).
//
// Linha-título com chevron (▸/▾) + sub-itens indentados quando expandido.
// Projeto atual = superfície de destaque (slot activeHighlight); sub-item
// ativo = peso 700 (mesmo padrão da TabBar do hub). Alturas mínimas vindas
// de shellNav (exigência §6, órfãos de layout documentados). onPress navega
// ao hub; onToggle expande/recolhe; onPressItem navega à seção.

import type { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ProjectDTO } from '@uhhu/contracts';
import { SIDEBAR_ROW_MIN_HEIGHT, SIDEBAR_SUBROW_MIN_HEIGHT } from './shellNav';
import { theme } from './theme';

export interface TreeSectionItem {
  key: string;
  label: string;
  active: boolean;
}

export interface ProjectTreeItemProps {
  project: ProjectDTO;
  expanded: boolean;
  current: boolean;
  items: TreeSectionItem[];
  onPress: () => void;
  onToggle: () => void;
  onPressItem: (key: string) => void;
}

export function ProjectTreeItem({
  project,
  expanded,
  current,
  items,
  onPress,
  onToggle,
  onPressItem,
}: ProjectTreeItemProps): JSX.Element {
  return (
    <View
      testID={current ? 'tree-item-current' : 'tree-item'}
      style={{
        backgroundColor: current ? theme.colors.activeHighlight : undefined,
        gap: theme.space.xs,
        paddingVertical: theme.space.xs,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          minHeight: SIDEBAR_ROW_MIN_HEIGHT,
        }}
      >
        <Pressable
          testID="tree-toggle"
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Recolher projeto' : 'Expandir projeto'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            minWidth: SIDEBAR_ROW_MIN_HEIGHT,
            minHeight: SIDEBAR_ROW_MIN_HEIGHT,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Caixa 44x44 da §6 da spec (alvo de toque mínimo); só o box cresce, o glifo não muda. */}
          <Text style={{ fontSize: theme.type.body }}>{expanded ? '▾' : '▸'}</Text>
        </Pressable>
        <Pressable
          testID="tree-title"
          onPress={onPress}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Text numberOfLines={1} style={{ fontSize: theme.type.body, fontWeight: '600' }}>
            {project.title}
          </Text>
        </Pressable>
      </View>
      {expanded
        ? items.map((item) => (
            <Pressable
              key={item.key}
              testID={`tree-section-${item.key}`}
              onPress={() => onPressItem(item.key)}
              accessibilityRole="button"
              style={{
                minHeight: SIDEBAR_SUBROW_MIN_HEIGHT,
                justifyContent: 'center',
                paddingLeft: theme.space.xxl,
                paddingRight: theme.space.md,
              }}
            >
              <Text
                style={{
                  fontSize: theme.type.body,
                  fontWeight: item.active ? '700' : '400',
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}
