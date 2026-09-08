# Groq TSP 交互课堂

**v1.0.0 · 初始版本**。用一个亮色 HTML 页面，展示 Prompt 如何经过主机、芯片与片间连接，完成 Attention / FFN 计算并返回 Token。左侧显示软件流程及指令、数据，中间演示硬件执行，右侧同步显示时间、算量、流量和带宽。

## 打开与使用

直接打开 [Groq_TSP_交互讲解.html](Groq_TSP_交互讲解.html)。脚本、样式和 Mermaid 图形已全部内嵌，动画运行无需联网或安装依赖；资料按钮打开公开网上原文，需要联网。

| 课堂 | 可观察内容 | 建议操作 |
| --- | --- | --- |
| Prefill / Decode 流程 | 八个完整环节、42 个操作；主机接入、算子、C2C、采样与下一轮 | 点击左侧环节，再选择具体操作；用底部按钮逐步或连续播放 |
| 逐周期执行 | 当前整数周期的指令和数据、ICU、SRAM、SR、MXM / VXM / SXM | 前后一拍、跳转事件、改变 Superlane、回退重放 |
| Attention / FFN 深入 | 34 步计算链、可手算小例子、硬件内部展开与性能公式 | 展开 MXM / MAC，查看 QK、Softmax、PV 和 SwiGLU 的中间数值 |

中间画布可选择单颗芯片、四片总览或跟随当前传输。右侧公式、模型参数和部署说明在同页详情面板展开，打开时暂停播放。方向键用于前后步骤或单拍，空格播放 / 暂停；窄屏通过软件、硬件、性能标签切换。

## 教学范围

- 完整流程包含外部请求、CPU 分词、PCIe / DMA、词嵌入、QKV、RoPE、KV、Attention、FFN、模型层与流水段、词表头、主机采样及返回。
- 四片教学板支持 PP2 × TP2、PP4、TP4 和两个模型副本；展示激活分发、部分和归约与阶段交接。请求保持副本绑定，历史 KV 留在所属芯片。
- 六类算子专题提供 30 个操作，区分矩阵、向量、归约、重排、存储和控制。Q 头与分片属于软件分工，MAC 位于 MXM，逐元素及归约算术同属 VXM。
- 逐周期课堂使用独立的确定性教学模型。参数化请求分镜、逐周期模型和手算窗口采用各自的时间与数值规模，不宣称复现真实芯片 trace 或 GroqCloud 私有部署。

具体硬件映射、FLOPs、访存、C2C、容量及 TTFT / TPOT 的计算口径见 [设计说明](docs/设计说明.md)。

## 项目组织

| 位置 | 内容 |
| --- | --- |
| `Groq_TSP_交互讲解.html` | 可独立分发的完整网页 |
| `index.html` | 开发入口，按顺序加载同目录脚本与样式 |
| 根目录的 `.js` / `.css` 与 `cycle-panel.html` | 当前三个课堂的模型、分镜、渲染、播放和界面源码 |
| `hardware/`、`hardware-diagrams.js` | Mermaid 源图、SVG 及内嵌图形和坐标包 |
| [教学方案](docs/教学方案.md) | 学习目标、完整流程、交互方式与验收口径 |
| [设计说明](docs/设计说明.md) | 硬件归属、数据和指令、数值链与性能公式 |
| [验证说明](docs/验证说明.md) | 检查命令、75 组覆盖、报告位置与限制 |
| `tools/` | 图形生成、离线打包与自动检查工具 |
| `reports/` | 检查时生成的临时报告，已忽略，不进入版本库 |

仓库维护当前可运行版本。过程草稿、旧版网页、参考截图和废弃工具不进入初始版本；文档使用固定名称维护，迭代历史交由 Git 记录。论文、讲稿、产品规格与外部研究依据全部使用下面的公开网上链接。

## 构建与检查

在仓库根目录执行；所有源文件和文档采用 UTF-8。

| 操作 | Windows 命令 |
| --- | --- |
| 仅更新独立网页 | `npm.cmd --prefix tools run pack` |
| 运行完整检查 | `npm.cmd --prefix tools run check` |
| 单独核对资料引用 | `npm.cmd --prefix tools run check:references` |
| 安装图形生成依赖 | `npm.cmd --prefix tools ci` |
| 重新生成 Mermaid 图形并打包 | `npm.cmd --prefix tools run build` |

打包和检查只需要 Node.js。重新生成图形需要锁定版本的 Mermaid、Playwright 和可用 Chromium 浏览器；可通过 `GROQ_RENDER_BROWSER` 指定浏览器程序。Linux / macOS 将 `npm.cmd` 替换为 `npm`。

初始版本检查覆盖数值、分片、通信、动画、逐周期状态、完整请求、文档链接和离线资源。检查使用真实应用脚本与时钟，以及程序构造的界面节点；不包含教学网页的浏览器点击、截图或视觉验收。

## 公开参考资料

资料引用仅使用下表中的公开网上入口。仓库内部的源码、Mermaid 资产及说明文档属于项目组成部分；独立 HTML 已内嵌运行所需的脚本、样式与图形。

| 资料 | 网上入口与用途 |
| --- | --- |
| ISCA 2020 · Think Fast | [作者公开 PDF](http://pkamath.com/publications/papers/tsp-isca20.pdf)、[出版 DOI](https://doi.org/10.1109/ISCA45697.2020.00023)：功能切片、流寄存器、ICU、PCIe / DMA |
| ISCA 2022 · Software-defined TSM | [出版 DOI](https://doi.org/10.1145/3470496.3527405)：多芯片互连与软件调度 |
| ASAP 2022 · Answer Fast | [作者预印本](https://arxiv.org/abs/2206.11062)：Attention、FFN 与主机通信 |
| Hot Chips 34 · Scale-out TSP | [会议官网讲稿](https://hc34.hotchips.org/assets/program/conference/day2/Machine%20Learning/HotChips34%20-%20Groq%20-%20Abts%20-%20final.pdf)：片间同步、Deskew、模型并行与归约 |
| GroqChip · Product Brief v1.5 | [Groq 产品原文的公开镜像](https://manuals.plus/m/3c668117454870c4f21fdd1d653ac2168bf523a305b16db5c9a800ca5a0186a1.pdf)：188 TFLOP/s、80 TB/s、SRAM 与 PCIe |
| GroqCard · Product Brief v1.5 | [BittWare 收录的 Groq 产品原文](https://www.bittware.com/files/GroqCard%E2%84%A2-Accelerator-Product-Brief-v1.5-.pdf)：板卡和 PCIe Gen4 x16 接口 |
| MLSys 2026 · SHIP | [会议摘要](https://proceedings.mlsys.org/paper_files/paper/2026/hash/9c20f16b05f5e5e70fa07e2a4364b80e-Abstract-Conference.html)、[会议论文](https://proceedings.mlsys.org/paper_files/paper/2026/file/9c20f16b05f5e5e70fa07e2a4364b80e-Paper-Conference.pdf)：LLM 服务、KV、Prefill 与 Decode |
| Groq 官方文本生成文档 | [Text Generation](https://console.groq.com/docs/text-chat)：请求字段、流式响应与结束条件 |

GroqCard 引用统一采用网上可直接获取的 v1.5 原文，版本名称同步更新；本页使用的 PCIe Gen4 x16 接口口径不变。产品镜像是 Groq 编写的原始规格书，并非镜像网站的二次解读。

2026-09-08 已直接访问核对作者 PDF、会议资料、预印本、产品 PDF 与官方文档。两个 DOI 均能解析到出版方；出版站点对自动访问返回验证页面或空响应，因此不将 DOI 落地页记为全文访问通过。常规引用检查不联网，避免将网络状态与动画功能检查混在一起。
