<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git ワークフロー

機能の実装が完了したら、必ず以下の流れでプッシュすること。ユーザーから指示がなくても、実装完了時に自動でこの手順を実行する。

1. **ブランチ作成** — `feature/<kebab-case-feature-name>` の命名規則で master から切る
2. **ステージング** — 関係するファイルのみを `git add` で個別に指定する（`git add .` や `git add -A` は使わない）
3. **コミット** — 日本語でコミットメッセージを書く。形式: `feat: <変更内容の要約>`（Co-Authored-By 行を末尾に付与）
4. **プッシュ** — `git push -u origin <branch>`
5. **master へマージ** — `git checkout master && git merge --no-ff <branch> -m "Merge branch '<branch>'"` でマージ
6. **master をプッシュ** — `git push origin master`
