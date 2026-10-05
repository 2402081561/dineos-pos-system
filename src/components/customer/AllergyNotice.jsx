import useCustomerLanguage from '../../hooks/useCustomerLanguage'
function AllergyNotice({ allergyInfo }) {
  const { t } = useCustomerLanguage()
  const details = Array.isArray(allergyInfo) ? allergyInfo.join(', ') : allergyInfo

  if (!details) return null

  return <section className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-5"><p className="flex items-center gap-2 text-sm font-bold text-amber-900"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">!</span>{t("Allergy information")}</p><p className="mt-3 text-sm leading-6 text-amber-800">{t("Contains or may contain:")}{' '}{details}</p></section>
}

export default AllergyNotice
