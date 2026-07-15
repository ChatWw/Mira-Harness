import { ref, reactive } from 'vue'

export function useTable<T = any>(apiFn: (params: any) => Promise<any>) {
  const loading = ref(false)
  const dataList = ref<T[]>([])
  const total = ref(0)
  const queryParams = reactive({ page: 1, pageSize: 10 })

  async function loadData() {
    loading.value = true
    try {
      const result = await apiFn(queryParams)
      dataList.value = result.list || result.data || []
      total.value = result.total || 0
    } finally {
      loading.value = false
    }
  }

  function handleSearch(params?: Record<string, any>) {
    if (params) {
      Object.assign(queryParams, params)
    }
    queryParams.page = 1
    loadData()
  }

  function handleReset() {
    Object.keys(queryParams).forEach(key => {
      if (key !== 'page' && key !== 'pageSize') {
        delete queryParams[key as keyof typeof queryParams]
      }
    })
    queryParams.page = 1
    loadData()
  }

  function handlePageChange(page: number, pageSize: number) {
    queryParams.page = page
    queryParams.pageSize = pageSize
    loadData()
  }

  return {
    loading,
    dataList,
    total,
    queryParams,
    loadData,
    handleSearch,
    handleReset,
    handlePageChange,
  }
}
