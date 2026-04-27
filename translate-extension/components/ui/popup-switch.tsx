type PopupSwitchProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
};

export function PopupSwitch({ checked, onChange, disabled = false }: PopupSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      className={`popup-switch${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (!disabled && onChange) {
          onChange(!checked);
        }
      }}
    >
      <span className="popup-switch-thumb" />
    </button>
  );
}
