import { ref } from 'vue'

export function useDialog<T = any>() {
  const visible = ref(false)
  const title = ref('')
  const mode = ref<'create' | 'edit'>('create')
  const editData = ref<T | null>(null)

  function openCreate(titleText = '新增') {
    mode.value = 'create'
    title.value = titleText
    editData.value = null
    visible.value = true
  }

  function openEdit(data: T, titleText = '编辑') {
    mode.value = 'edit'
    title.value = titleText
    editData.value = data
    visible.value = true
  }

  function close() {
    visible.value = false
    setTimeout(() => {
      editData.value = null
    }, 300)
  }

  return {
    visible,
    title,
    mode,
    editData,
    openCreate,
    openEdit,
    close,
  }
}
