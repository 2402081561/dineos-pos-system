import useCustomerLanguage from '../../hooks/useCustomerLanguage'
function PagePlaceholder({ title, description }) {
  const { t: uiText } = useCustomerLanguage()

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">{uiText(title)}</h1>
      <p className="mt-2 text-slate-600">{uiText(description)}</p>
    </section>
  )
}

export default PagePlaceholder
