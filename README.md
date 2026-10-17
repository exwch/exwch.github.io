# 网页游戏合集 · Web Game Collection

学生用 HTML + Canvas 写的网页小游戏合集。全部是纯前端、零依赖，打开网页就能玩。

线上地址：<https://exwch.github.io/>

## 包含的游戏

| 游戏 | 目录 | 玩法简介 |
| --- | --- | --- |
| 双人冒险 · Super Duo Bros | `mario/` | 同屏双人横版闯关：冲刺加速跑、最多 5 秒飞行、大跳小跳、每人一个专属技能，两人都碰到旗杆才过关 |
| 货车贪吃蛇 · Truck Snake | `truck-snake/` | 开一辆不会掉头的长头卡车撞摩托，每撞毁一辆多挂一节车厢，连击越高氮气越快，车越长转弯半径越大 |
| 怒鸟战术 · Angry Tactics | `angry-tactics/` | 卡牌回合 + 愤怒的小鸟弹射物理：出牌、拖拽瞄准、松手发射，飞行中点一下触发小鸟技能 |
| 恶魔轮盘 · Demon Roulette | `demon-roulette/` | 经典俄罗斯转盘赌枪：轮流扣扳机、空包打自己保留回合；每回合可加弹或卸弹，限次重摇轮盘窥探枪口那一格 |

## 本地运行

直接双击根目录的 `index.html`（合集首页），点卡片进入任意游戏即可。
每个游戏的子目录里也有自己的 `index.html`，可以单独打开。

如果要用本地服务器（可选）：

```bash
python -m http.server 8000
# 然后浏览 http://localhost:8000
```

## 目录结构

```
exwch.github.io/
├─ index.html              合集首页（四张游戏卡片）
├─ mario/                  双人冒险（马里奥）
│  ├─ index.html
│  ├─ styles.css
│  ├─ js/                  渲染 / 物理 / 关卡 / 音效等模块
│  ├─ tools/               无头测试脚本（node tools/simtest.js）
│  └─ preview-*.png
├─ truck-snake/
│  └─ index.html           单文件游戏（内联 CSS + JS）
├─ angry-tactics/
   ├─ index.html
   ├─ css/style.css
   ├─ js/                  physics.js / data.js / game.js
   └─ README.md
└─ demon-roulette/
   └─ index.html           单文件游戏（轮盘 + 恶魔 AI + 双人同屏）
```

## 新增一个游戏

1. 在仓库根目录新建一个文件夹，例如 `mygame/`，把游戏放进去，入口文件命名为 `index.html`。
2. 如果游戏引用了自己的 css / js / 图片，保持相对路径即可；不要用 `C:\...` 这样的绝对路径。
3. 在根目录 `index.html` 的 `<main class="grid">` 里复制一张卡片，改掉 `href`、标题、简介和预览图。
4. 建议在游戏页面里放一个返回入口：`<a href="../index.html">🏠 合集</a>`，方便回到首页。

## 发布到 GitHub Pages

```bash
git add -A
git commit -m "更新游戏合集"
git push
```

推送到 `main` 分支后，GitHub Pages 会自动更新 <https://exwch.github.io/>（通常 1 分钟内生效）。
