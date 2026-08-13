import useOperationalTables from './useOperationalTables'

function useStaffTables() {
  const { tables, isLoading, error } = useOperationalTables()
  return { error, isLoading, tableOverview: tables }
}

export default useStaffTables
