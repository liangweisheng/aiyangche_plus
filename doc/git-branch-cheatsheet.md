# Git 分支操作速查手册

> 项目：aiyangche_plus  
> 用途：日常 Git 分支操作的常用命令参考

---

## 1. 查看分支

```bash
# 查看本地分支列表（当前分支前有 * 号）
git branch

# 查看所有分支（含远程分支）
git branch -a

# 查看本地分支与远程分支的对应关系
git branch -vv

# 查看已合并到当前分支的分支列表
git branch --merged

# 查看未合并的分支
git branch --no-merged
```

---

## 2. 创建与切换分支

```bash
# 创建新分支（基于当前 HEAD）
git branch 分支名

# 切换到指定分支
git checkout 分支名
# 或
git switch 分支名

# 创建并切换到新分支（一步完成，推荐）
git checkout -b 分支名
# 或
git switch -c 分支名

# 基于远程分支创建本地分支并关联
git checkout -b 本地分支名 origin/远程分支名
```

---

## 3. 重命名与删除分支

```bash
# 重命名当前分支
git branch -m 新名称

# 重命名指定分支
git branch -m 旧名称 新名称

# 删除本地已合并分支（安全删除）
git branch -d 分支名

# 强制删除本地分支（即使未合并）
git branch -D 分支名

# 删除远程分支
git push origin --delete 远程分支名
```

---

## 4. 暂存与提交

```bash
# 查看文件变更状态
git status

# 查看具体变更内容
git diff

# 添加文件到暂存区
git add 文件名          # 添加指定文件
git add .               # 添加所有变更（含新增）
git add -A              # 添加所有变更（同上）
git add -u              # 仅添加修改/删除文件（不含新增）

# 提交（务必写清晰的信息）
git commit -m "提交信息"

# 跳过暂存区直接提交（仅对已追踪文件）
git commit -a -m "提交信息"

# 修改上一次提交信息
git commit --amend -m "新信息"

# 撤销暂存（保留工作区修改）
git restore --staged 文件名
# 或
git reset HEAD 文件名

# 撤销工作区修改（⚠️ 会丢失未提交的修改）
git restore 文件名
```

---

## 5. 合并分支

```bash
# 将指定分支合并到当前分支
git merge 分支名

# 不自动创建合并提交（保留分支历史）
git merge --no-ff 分支名

# 放弃本次合并（有冲突时）
git merge --abort

# 冲突解决后标记已解决
git add 已解决的文件
git commit
```

---

## 6. 变基 (Rebase)

```bash
# 将当前分支变基到目标分支
git rebase 目标分支

# 交互式变基（压缩/修改提交历史）
git rebase -i HEAD~N   # 最近 N 个提交
git rebase -i 提交哈希  # 从该提交之后开始

# 中断变基回到原状
git rebase --abort

# 变基冲突解决后继续
git rebase --continue
```

> ⚠️ **注意**：不要对已推送到远程的公共分支做 rebase。

---

## 7. 远程操作

```bash
# 查看远程仓库
git remote -v

# 推送到远程（首次推新分支时设置上游）
git push -u origin 分支名

# 推送到远程（已有上游）
git push

# 拉取远程最新代码并合并到当前分支
git pull

# 拉取但不自动合并
git fetch

# 从远程拉取指定分支
git fetch origin 远程分支名

# 删除远程分支
git push origin --delete 分支名
```

---

## 8. 标签管理

```bash
# 查看所有标签（按字母序）
git tag

# 创建轻量标签
git tag 标签名

# 创建附注标签（推荐，含作者/日期/信息）
git tag -a v版本号 -m "版本说明"

# 推送指定标签到远程
git push origin 标签名

# 推送所有标签到远程
git push origin --tags

# 删除本地标签
git tag -d 标签名

# 删除远程标签
git push origin :refs/tags/标签名
```

---

## 9. 贮藏 (Stash)

```bash
# 暂存当前工作区修改（工作区变干净）
git stash

# 暂存并添加描述
git stash push -m "描述信息"

# 查看暂存列表
git stash list

# 恢复最近一次暂存（并删除该暂存）
git stash pop

# 恢复指定暂存（不删除）
git stash apply stash@{编号}

# 删除指定暂存
git stash drop stash@{编号}

# 清空所有暂存
git stash clear
```

---

## 10. 查看历史与日志

```bash
# 查看提交历史
git log

# 简洁一行显示
git log --oneline

# 图形化显示分支历史
git log --graph --oneline --all

# 查看分支拓扑（推荐）
git log --graph --oneline --all --decorate

# 查看某文件的历史修改
git log --follow -- 文件名
```

---

## 11. 其他实用命令

```bash
# 查看工作区 vs 暂存区差异
git diff

# 查看暂存区 vs 上次提交差异
git diff --staged

# 查看两个分支的差异
git diff 分支A 分支B

# 复制某个提交的修改到当前分支（cherry-pick）
git cherry-pick 提交哈希

# 查看某次提交的具体修改
git show 提交哈希

# 清空工作区、暂存区，恢复到上次提交状态（⚠️ 危险，会丢失所有未提交修改）
git reset --hard HEAD
```

---

## 12. 本项目分支策略

| 分支 | 用途 |
|------|------|
| `master` | 稳定发布版本，只从 `optimize/v*` 合并 |
| `optimize/v*` | 积累小版本修复，测试稳定后合并到 `master` |
| `inv` | 库存管理功能开发分支，完成后合并到 `optimize/v*` |

**开发流程示例：**

```bash
# 1. 从最新 master 拉取
git checkout master
git pull
git checkout -b inv

# 2. 在 inv 分支上开发，多次提交
git add .
git commit -m "feat: 新增库存管理模块"

# 3. 合并到 optimize/v6.x
git checkout optimize/v6.x
git pull
git merge inv

# 4. 打版本标签
git tag -a v7.0.0 -m "v7.0.0 - 库存管理功能发布"
git push origin v7.0.0

# 5. 合并到 master
git checkout master
git pull
git merge optimize/v6.x
git push
```

---

## 13. 常见问题

**Q：分支名称太长记不住怎么办？**
A：项目约定使用短名称，如 `inv` 替代 `feature/inventory-management`。使用 `git branch -m` 重命名。

**Q：提交后发现忘记加某个文件？**
```bash
git add 漏掉的文件
git commit --amend --no-edit   # 合并到上一次提交，不修改信息
```

**Q：想放弃当前分支的所有修改？**
```bash
git checkout -- .              # 撤销工作区所有修改
git clean -fd                  # 删除所有未追踪文件
```

**Q：想丢弃某个分支的全部提交？**
```bash
git reset --hard 目标提交哈希  # 分支指针移到目标提交
# 如果是已推送的分支，需加 -f 强制推送（⚠️ 谨慎）
git push -f origin 分支名
```

**Q：如何换行写较长的提交信息？**
```bash
git commit                    # 不带 -m 会打开默认编辑器
# 或者用 -m 分行（PowerShell/CMD 不支持，请用 Git Bash）
```

---

> **⚠️ 特别说明**：本站点使用微信小程序开发环境，GitHub 尚未配置。在配置远程仓库前，请勿执行 `git push`，仅做本地提交即可。如需推送，请先配置远程仓库地址：`git remote add origin 远程仓库URL`。
