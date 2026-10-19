import useCustomerLanguage from '../../hooks/useCustomerLanguage'
function SectionHeading({ eyebrow, title, description, action }) {
  const { t: uiText } = useCustomerLanguage()

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow">{uiText(eyebrow)}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{uiText(title)}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{uiText(description)}</p>}
      </div>
      {action}
    </div>
  )
}

export default SectionHeading
