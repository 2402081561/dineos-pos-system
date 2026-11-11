// Keep the user's decimal text while editing (including "0." and "0.50").
// Number inputs can sanitize intermediate decimals and respond to wheel events.
export default function MoneyInput({ value, onChange, ...props }) {
  return <input {...props} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={9} value={String(value ?? '')} onChange={event => {
    if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value)) onChange(event)
  }}/>
}
