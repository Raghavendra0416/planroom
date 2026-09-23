'use client';

import * as Select from '@radix-ui/react-select';
import type { ReactNode } from 'react';

const EMPTY = '__empty';

/**
 * One option in a paper select. `value` is the stored token, not the visible label.
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Paper select with a rule edge and no menu blur.
 * @param props - Select props.
 * @param props.id - Id of the trigger, used by the caption label.
 * @param props.caption - Visible field name. Omit it when the selected label is the control name.
 * @param props.value - Selected value, or `''` when nothing is selected.
 * @param props.onValueChange - Called with the stored value, or `''` when the empty option is chosen.
 * @param props.options - Choices. Values must be non-empty.
 * @param props.placeholder - Text shown when `value` is empty.
 * @param props.invalid - Draws the oxide border when the field failed.
 * @param props.allowEmpty - Adds an option that clears the value. Its text is `emptyLabel` or the caption.
 * @param props.emptyLabel - Text of the clearing option.
 * @returns The caption, trigger, and menu.
 */
export function SelectField({
  id,
  caption,
  value,
  onValueChange,
  options,
  placeholder,
  invalid = false,
  allowEmpty = false,
  emptyLabel,
}: {
  id: string;
  caption?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}): ReactNode {
  const selected = options.find((option) => option.value === value);
  const captionId = caption ? `${id}-label` : undefined;
  const selectValue = selected ? value : EMPTY;

  return (
    <div className="select-field">
      {caption ? (
        <label htmlFor={id} id={captionId}>
          {caption}
        </label>
      ) : null}
      <Select.Root value={selectValue} onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}>
        <Select.Trigger
          aria-invalid={invalid || undefined}
          aria-labelledby={captionId}
          className={invalid ? 'select-trigger has-error' : 'select-trigger'}
          id={id}
        >
          <Select.Value placeholder={placeholder ?? caption ?? ''}>{selected?.label}</Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content align="start" className="select-content" position="popper" side="bottom" sideOffset={4}>
            <Select.Viewport className="select-viewport">
              {allowEmpty ? (
                <Select.Item className="select-item" value={EMPTY}>
                  <Select.ItemText>{emptyLabel ?? caption ?? ''}</Select.ItemText>
                </Select.Item>
              ) : null}
              {options.map((option) => (
                <Select.Item className="select-item" key={option.value} value={option.value}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
