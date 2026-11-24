# 模型来源与发布边界

核对记录：2026-11-25。公开演示只发布经审查的 `public/` 资产；受限模型仍只保存在本地。

## Nike / ニケ · DeepSeek-chan

- 来源：https://github.com/tegnike/deepseek-chan-vrm
- 原始模型：`public/avatars/deepseek.vrm`。
- 原始工程：`models/nike-source/DeepSeek-chan.blend`。
- 原作：上善无形；女仆设计：ZipZipPipe；3D：ニケ。
- 随包条款：`public/licenses/nike-readme.md`、`nike-license.txt`。
- 原版及本项目模型改版使用 CC BY-NC-SA 4.0；改动见 `public/licenses/DERIVATIVES.md`。

## 水原镜 / Mzkagami · 蓝色大肥鱼

- 作者配布：https://booth.pm/en/items/8777527
- 作者演示：https://www.bilibili.com/video/BV1WNt86bEyu/
- 本地文件：`local-assets/fish/mirror.vrm`，10,427,496 字节。
- 这是既有 62667 demo 使用的 **StarLite 转换版**，不是作者原始 VRM 包。
- 转换链路与条款：`public/licenses/mirror-sources.md`、`mirror-license.md`。
- StarLite 的特别托管授权不等于本项目的公开再分发许可。仅本地比较，不修改或借用素材。

## 木子恶魔 · 蓝色小肥鱼 Deepseek

- 作者配布：https://www.aplaybox.com/details/model/ayXkRzVflmnd
- 本地文件：`local-assets/fish/muzi.vrm`，18,480,432 字节。
- 沿用既有 62667 demo 的文件；来源插件说明见 `public/licenses/muzi-source.md`。
- 随插件分发的授权不扩大到本项目。文件元数据限制修改和再分发。
- 仅本地比较；不修改原文件，不取用其网格、贴图或配件。

## 插画、旧模型与技术组件

- 用户提供的 QQ 图片链接仅作造型参考，未随项目或构建打包。
- `public/cast/*.glb`、`models/*.blend` 和旧制作脚本是此前的程序化模型，保留作历史材料；新页面不加载它们。
- Three.js、@pixiv/three-vrm、Vite 各自遵循其软件许可证；软件许可证不覆盖模型。
- VRM Add-on for Blender：https://github.com/saturday06/VRM-Addon-for-Blender ，制作使用 v4.10.2。

## 公开部署约束

1. 只部署审查后的静态构建，不上传 `local-assets/`。
2. 保留原作署名、完整模型许可和改版记录，遵守非商业及相同方式共享条件。
3. 对独立同人角色设计、标志和用途另行核对权利；底模许可不是所有设计元素的通行许可。
4. 若要公开提供另两款模型，先取得作者针对本项目的明确授权。

GitHub Actions 在上传 Pages 产物前运行 `tools/audit-public-build.mjs`，验证四个可发布 VRM 的路径、完整性与署名文件，阻止受限模型和本地素材目录进入发布包。
