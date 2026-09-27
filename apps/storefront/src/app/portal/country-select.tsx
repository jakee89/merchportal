const names = new Intl.DisplayNames(["en"], { type: "region" })
const countries = Array.from({ length: 26 * 26 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26))
  .map((code) => ({ code: code.toLowerCase(), name: names.of(code) || code }))
  .filter(({ code, name }) => name.toUpperCase() !== code.toUpperCase() && name !== "Unknown Region")
  .sort((left, right) => left.name.localeCompare(right.name))

export default function CountrySelect({ name, value, onChange }: { name?: string; value: string; onChange?: (value: string) => void }) {
  return <select name={name} value={value.toLowerCase()} onChange={(event) => onChange?.(event.target.value)} required>
    {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
  </select>
}
