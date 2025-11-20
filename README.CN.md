# auto-themer

自动为不同 VSCode 窗口-工作区分配与应用配色主题，并支持按工作区路径持久化主题映射。

![image](./public/image1.png)


## 功能

- 自动分配唯一主题：如果开启自动分配，多窗口场景会为每个窗口分配不同主题，提升区分度
- 冲突检测与提示：检测多个窗口使用相同主题时给出提醒
- 工作区持久化映射：通过设置项文本 `autoThemer.themeMappingsText` 定义“工作区路径 → 主题”映射
- 简洁侧边栏：支持快速选择主题、持久化当前主题、查看并编辑映射

## 执行原理与链路

- 多窗口主题检查原理：
  所有VSCode窗口使用同一全局存储位置文件进行实例协调，位置: context.globalStorageUri.fsPath下的instances目录。(mac: ~/Library/Application Support/Code/User/globalStorage/xxxxx.auto-theme-switcher/instances)
- 多窗口主题设置原理：
  基于打开的工作区中.vscode中的setting.json，关闭窗口或者关闭工作区则重置setting.json的colorTheme。

链路：
1. 启动后延迟初始化，扫描与记录活动窗口实例
2. 检查是否打开工作区，若存在持久化映射则直接应用映射主题（优先级最高）
3. 若无映射且为多窗口场景，执行唯一主题分配并通知
4. 定期检查主题冲突并通过侧边栏与通知提示用户
5. 关闭窗口或移除工作区时，重置工作区 `.vscode/settings.json` 的 `workbench.colorTheme`，保证临时设置不残留

## 使用

- 命令面板：
  - `Auto Themer: Enable`
  - `Auto Themer: Disable`
  - `Auto Themer: Switch Theme`
  - `Auto Themer: Reassign Theme for Current Window`
  - `Auto Themer: Persist Current Theme for Workspace`
  - `Auto Themer: Show Theme Mappings`
- 侧边栏：选择主题、随机主题、重新分配、持久化当前主题、查看工作区与主题的映射关系
- 快捷键：`Ctrl+Alt+T`（Mac：`Cmd+Alt+T`）切换随机主题

## 配置

在 VSCode 设置中配置：

```json
{
  "autoThemer.enabled": true,
  "autoThemer.builtinThemes": [
    "Default Dark+",
    "Default Light+",
    "Monokai",
    "Solarized Dark",
    "Solarized Light",
    "Abyss",
    "Red",
    "Kimbie Dark",
    "Tomorrow Night Blue"
  ],
  "autoThemer.themeMappingsText": "/my/pro-dev: Kimbie Dark; /easy/hc: Kimbie Dark"
}
```

说明：`themeMappingsText` 使用分号分隔的 `路径: 主题` 文本，插件在内存中解析并使用该映射。

## 开发

1. `npm install`
2. `npm run compile`
3. 在 VSCode 中按 F5 启动扩展开发主机

## 许可证

MIT License
