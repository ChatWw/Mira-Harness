# 内置服务商协议地址

核对日期：2026-10-29。下表记录最终请求路径，API 地址输入框保存对应的基础路径。
切换协议只转换已知路径，保留原主机、地区、端口及代理前缀；未知的手动路径保持原样。
不会在载入页面时批量改写已有配置。自定义服务商不套用内置规则。

| 服务商 | OpenAI Completions | OpenAI Responses | Anthropic Messages | 官方依据 |
| --- | --- | --- | --- | --- |
| 深度求索 | `/chat/completions`（也保留已有 `/v1/chat/completions`） | `/responses` | `/anthropic/v1/messages` | [Responses](https://api-docs.deepseek.com/zh-cn/guides/responses_api)、[Anthropic](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api) |
| 智谱 / Z.AI | `/api/paas/v4/chat/completions` | `/api/v1/responses` | `/api/anthropic/v1/messages` | [Responses](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)、[Anthropic](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)、[Z.AI](https://docs.z.ai/llms-full.txt) |
| 月之暗面 | `/v1/chat/completions` | `/v1/responses` | `/anthropic/v1/messages` | [Responses](https://platform.moonshot.ai/docs/api/responses)、[Messages](https://platform.moonshot.cn/docs/api/messages) |
| MiniMax | `/v1/chat/completions` | `/v1/responses` | `/anthropic/v1/messages` | [Chat](https://platform.minimaxi.com/docs/api-reference/text-openai-api)、[Responses](https://platform.minimaxi.com/docs/api-reference/responses-create)、[Anthropic](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api) |
| 阿里千问 / 阿里云百炼 | `/compatible-mode/v1/chat/completions` | `/compatible-mode/v1/responses` | `/apps/anthropic/v1/messages` | [Responses](https://help.aliyun.com/zh/model-studio/compatibility-with-openai-responses-api)、[Anthropic](https://help.aliyun.com/zh/model-studio/anthropic-api-messages) |
| 硅基流动 | `/v1/chat/completions` | 不开放选择 | `/v1/messages` | [API 文档](https://docs.siliconflow.cn/)、[Messages](https://docs.siliconflow.cn/docs/api/messages-post)；文档未提供 Responses，匿名 POST `/v1/responses` 返回 404 |
| 百川 | `/v1/chat/completions` | `/v1/responses` | 不开放选择 | [官方 API 文档](https://platform.baichuan-ai.com/docs)（官方站点 `/api/gitlab/yaml` 的 `responses-medical.yaml` 给出 Responses 路径）；未提供 Messages 文档，匿名 POST `/v1/messages` 返回 404 |
| 火山引擎（豆包） | `/api/v3/chat/completions` | `/api/v3/responses` | `/api/compatible/v1/messages` | [Responses](https://www.volcengine.com/docs/ark/create-model-responses-api)、[Messages](https://www.volcengine.com/docs/ark/messages-api) |
| 魔搭 | `/v1/chat/completions` | `/v1/responses` | `/v1/messages` | [API 推理介绍](https://modelscope.cn/docs/model-service/API-Inference/intro) |
| 腾讯云 TokenHub | `/v1/chat/completions` | `/v1/responses` | `/v1/messages` | [接入文档](https://cloud.tencent.com/document/product/1823/130079) |
| 百度云千帆 | `/v2/chat/completions` | `/v2/responses` | `/anthropic/v1/messages` | [Chat](https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb)、[Responses](https://cloud.baidu.com/doc/qianfan-api/s/vmhejnuy8)、[Anthropic](https://cloud.baidu.com/doc/qianfan-docs/s/6mh3e6gjp) |
| Xiaomi MiMo | `/v1/chat/completions` | `/v1/responses` | `/anthropic/v1/messages` | [Responses](https://mimo.mi.com/static/docs/api/chat/responses.md)、[Anthropic](https://mimo.mi.com/static/docs/api/chat/anthropic-api.md) |
| Ollama | `/v1/chat/completions` | `/v1/responses` | `/v1/messages` | [OpenAI 兼容](https://docs.ollama.com/api/openai-compatibility)、[Anthropic 兼容](https://docs.ollama.com/api/anthropic-compatibility) |

支持协议表示服务商提供该接口，不表示其每个模型或套餐均支持：百川 Responses 为医疗模型接口；魔搭 Responses 文档当前限定 Qwen3.5 系列，Anthropic 接口为 beta；本地 Ollama 需要支持相应接口的版本。

模型列表统一走内置服务商的 OpenAI 模型列表地址，避免向独立的 Anthropic 基础路径追加 `/models`。
硅基流动的 Messages 按官方示例使用 Bearer 鉴权；其他内置 Messages 使用 `x-api-key`。
这里只核实公开文档和无密钥路由响应，没有使用用户密钥进行在线推理。
