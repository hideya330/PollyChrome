import json
import base64
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

polly_client = boto3.client('polly')

def lambda_handler(event, context):
    try:
        # API Gatewayのプロキシ統合からのイベントボディを取得
        body = event.get('body')
        if not body:
            return _build_response(400, {'error': 'Request body is missing'})
        
        # bodyが文字列（JSON）の場合はパースする
        if isinstance(body, str):
            body = json.loads(body)
            
        text = body.get('text')
        if not text or not text.strip():
            return _build_response(400, {'error': 'Text is missing or empty'})
            
        logger.info(f"Text to synthesize: {text[:50]}...")
            
        # Amazon Pollyで音声合成 (日本語の男性音声: Takumi)
        response = polly_client.synthesize_speech(
            Text=text,
            OutputFormat='mp3',
            VoiceId='Takumi'
        )
        
        # 音声ストリームの取得とBase64エンコード
        if 'AudioStream' in response:
            audio_stream = response['AudioStream'].read()
            audio_base64 = base64.b64encode(audio_stream).decode('utf-8')
            return _build_response(200, {'audio': audio_base64})
        else:
            return _build_response(500, {'error': 'Failed to generate audio stream'})
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return _build_response(500, {'error': 'Internal server error', 'details': str(e)})

def _build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }