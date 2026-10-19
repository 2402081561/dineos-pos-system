import useCustomerLanguage from '../../hooks/useCustomerLanguage'
function Button({ children, className = '', disabled = false, isLoading = false, variant = 'primary', type = 'button', ...buttonProps }) {
  const { t } = useCustomerLanguage()
  const styles = {
    primary: 'bg-orange-600 text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700',
    secondary: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  }

  return (
    <button aria-busy={isLoading || undefined} className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:transform-none disabled:opacity-50 ${styles[variant]} ${className}`} disabled={isLoading || disabled} type={type} {...buttonProps}>
      {isLoading && <span aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {isLoading ? t("Loading...") : (typeof children === 'string' ? t(children) : children)}
    </button>
  )
}

export default Button
