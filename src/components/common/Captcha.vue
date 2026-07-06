<template>
  <div class="captcha-wrapper">
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      @click="refreshCaptcha"
      class="captcha-canvas"
      title="点击刷新验证码"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
}>(), {
  width: 120,
  height: 40,
})

const emit = defineEmits<{
  change: [code: string]
}>()

const canvasRef = ref<HTMLCanvasElement>()
const currentCode = ref('')

// 生成随机验证码
function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// 绘制验证码
function drawCaptcha() {
  if (!canvasRef.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 清空画布
  ctx.clearRect(0, 0, props.width, props.height)

  // 绘制背景
  const gradient = ctx.createLinearGradient(0, 0, props.width, props.height)
  gradient.addColorStop(0, '#f0f0f0')
  gradient.addColorStop(1, '#e0e0e0')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, props.width, props.height)

  // 生成新验证码
  currentCode.value = generateCode()

  // 绘制干扰线
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.3)`
    ctx.beginPath()
    ctx.moveTo(Math.random() * props.width, Math.random() * props.height)
    ctx.lineTo(Math.random() * props.width, Math.random() * props.height)
    ctx.stroke()
  }

  // 绘制验证码文字
  const code = currentCode.value
  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const fontSize = 20 + Math.random() * 10
    ctx.font = `bold ${fontSize}px Arial`
    ctx.fillStyle = `rgb(${Math.random() * 100},${Math.random() * 100},${Math.random() * 100})`

    const x = 15 + i * 25
    const y = 25 + Math.random() * 5
    const angle = (Math.random() - 0.5) * 0.5

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillText(char, 0, 0)
    ctx.restore()
  }

  // 绘制干扰点
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.5)`
    ctx.beginPath()
    ctx.arc(Math.random() * props.width, Math.random() * props.height, 1, 0, 2 * Math.PI)
    ctx.fill()
  }

  // 通知父组件验证码已更新
  emit('change', currentCode.value)
}

// 刷新验证码
function refreshCaptcha() {
  drawCaptcha()
}

// 验证输入的验证码
function validate(input: string): boolean {
  return input.toLowerCase() === currentCode.value.toLowerCase()
}

onMounted(() => {
  drawCaptcha()
})

defineExpose({
  validate,
  refresh: refreshCaptcha,
})
</script>

<style scoped>
.captcha-wrapper {
  display: inline-block;
}

.captcha-canvas {
  border: 1px solid var(--cp-border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s;
  display: block;
}

.captcha-canvas:hover {
  border-color: var(--cp-primary);
}
</style>
