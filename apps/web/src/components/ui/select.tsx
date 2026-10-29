import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import './select.css';

type SelectProps = Omit<ComponentProps<typeof SelectPrimitive.Root>, 'value' | 'defaultValue'> &
  Pick<
    ComponentProps<typeof SelectPrimitive.Trigger>,
    'id' | 'aria-label' | 'aria-labelledby' | 'className'
  > & {
    value?: string | number;
    defaultValue?: string | number;
    placeholder?: string;
  };

export function Select({
  children,
  value,
  defaultValue,
  placeholder,
  id,
  className = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: SelectProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useCallback((element: HTMLButtonElement | null) => {
    if (element) {
      setPortalContainer(element.closest('dialog'));
    }
  }, []);
  return (
    <SelectPrimitive.Root
      {...props}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={`ui-select-trigger ${className}`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portalContainer}>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={5}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectItem({
  value,
  children,
  disabled,
}: {
  value: string | number;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Item className="ui-select-item" value={String(value)} disabled={disabled}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-indicator">
        <Check size={14} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
