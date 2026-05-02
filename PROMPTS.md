# AI Prompt Instructions for PollyChrome

このファイルは、Gemini Code AssistなどのAIアシスタントに開発をサポートしてもらうためのプロンプト集です。
AIに指示を出す際は、以下の該当するロールと背景をコピー＆ペーストしてチャットに入力してください。

## 1. プロジェクトの基本コンテキスト（共通）
> このプロジェクトは、Chrome拡張機能からAWSのAmazon Pollyを呼び出してテキストを読み上げるシステム「PollyChrome」です。
> セキュリティのため、拡張機能から直接AWSを叩くのではなく、AWS API Gateway + Lambda を経由して Polly を実行します。

## 2. インフラ (Terraform) 開発用プロンプト
**対象ファイル:** `terraform/main.tf` などを開いた状態で実行

> あなたは熟練したフルスタックエンジニアです。
> 上記のプロジェクトの基本コンテキストを踏まえ、以下の要件を満たすインフラを、AWSプロバイダを使ったTerraformコードで記述してください。
> 
> 【要件】
> - API Gateway (REST API) を構築し、POSTメソッドを受け付けるようにする。
> - Lambda関数 (`terraform/lambda/index.py` に配置予定) を呼び出すプロキシ統合を設定する。
> - API GatewayのCORS設定を行い、すべてのオリジン（`*`）からのPOSTを許可する。
> - セキュリティのため、API Gatewayの「APIキー」を必須とし、使用量プラン（Usage Plan）と紐付ける。
> - Lambda関数がAmazon Pollyを実行できる権限（`AmazonPollyReadOnlyAccess`）を持つIAMロールとポリシーを作成する。
> - デプロイ完了時に、APIのエンドポイントURLと作成されたAPIキーを `outputs.tf` に出力する設定を含める。

## 3. バックエンド (Python/Lambda) 開発用プロンプト
**対象ファイル:** `terraform/lambda/index.py` などを開いた状態で実行

> あなたは優秀なバックエンドエンジニアです。
> 上記のプロジェクトの基本コンテキストを踏まえ、AWS Lambda上で動き、Amazon Pollyを使ってテキストを音声に変換するPython 3のコードを記述してください。
> 
> 【要件】
> - API Gatewayからプロキシ統合で送られてくるイベント（JSONボディ内の `text` フィールド）を受け取る。
> - boto3クライアントを使用して、受け取ったテキストをAmazon Pollyで音声に合成する（OutputFormat='mp3', VoiceId='Takumi' 等）。
> - 生成された音声ストリームをBase64でエンコードする。
> - API Gatewayに返すレスポンスとして、ステータスコード200、適切なCORSヘッダー（`Access-Control-Allow-Origin: '*'`）、およびBase64エンコードされた音声データ（`{"audio": "..."}`）を含むJSONを返す。
> - エラーハンドリング（テキストが空の場合やPollyの呼び出し失敗時の500エラーなど）を適切に行う。

## 4. フロントエンド (Chrome拡張) 開発用プロンプト
**対象ファイル:** `extension/background.js` などを開いた状態で実行

> あなたは優秀なフロントエンドエンジニアです。
> 上記のプロジェクトの基本コンテキストを踏まえ、Manifest V3準拠のChrome拡張機能のService Workerスクリプトを記述してください。
> 
> 【要件】
> - `config.js` から `CONFIG.API_URL` と `CONFIG.API_KEY` をインポートして使用する（ES Modules形式）。
> - 拡張機能のインストール時に、「Pollyで読み上げ」というコンテキストメニュー（右クリックメニュー）を作成する。対象は選択されたテキスト（`contexts: ["selection"]`）とする。
> - メニューがクリックされたら、選択されたテキストをAWS API GatewayへPOSTリクエストで送信する。
> - `fetch` を使用し、ヘッダーには `"Content-Type": "application/json"` と `"x-api-key"` を含める。
> - APIからBase64エンコードされた音声データを受け取ったら、現在アクティブなタブにスクリプトをインジェクトし（`chrome.scripting.executeScript` を使用）、HTML5のAudioオブジェクトを使って音声を再生させる。