#!/bin/zsh
set -euo pipefail

API_BASE_URL="${HISTORA_API_URL:-http://127.0.0.1:4000}"
WEB_ORIGIN="${HISTORA_WEB_URL:-http://localhost:3000}"

login_json=$(
  curl -s -X POST "$API_BASE_URL/api/auth/login" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    --data '{"email":"studioe2e@gmail.com","password":"TestPassword123","deviceId":"test-device-000000000001","deviceName":"Playwright Test Device"}'
)

token=$(printf '%s' "$login_json" | jq -r '.accessToken')

story_id=$(
  curl -s "$API_BASE_URL/api/stories/public/feed-author-public-story" \
    -H "Authorization: Bearer $token" | jq -r '.id'
)

safe_message=$(
  curl -s -X POST "$API_BASE_URL/api/anonymous-messages" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data '{"recipientUsername":"feedauthor","body":"This safe anonymous message exists only to test that helper contact unlock cannot be triggered by the sender and that public comment listing still requires the share slug.","distribution":"app"}'
)

message_id=$(printf '%s' "$safe_message" | jq -r '.id')
share_slug=$(printf '%s' "$safe_message" | jq -r '.shareSlug')

echo '=== malicious comment ==='
curl -i -s -X POST "$API_BASE_URL/api/comments" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  --data "{\"targetType\":\"storyChapter\",\"targetId\":\"$story_id:1\",\"body\":\"<script>alert(1)</script>\"}"

echo
echo '=== malicious anonymous message ==='
curl -i -s -X POST "$API_BASE_URL/api/anonymous-messages" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  --data '{"recipientUsername":"feedauthor","body":"<img src=x onerror=alert(1)>","distribution":"external"}'

echo
echo '=== malicious story ==='
curl -i -s -X POST "$API_BASE_URL/api/stories" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  --data '{"title":"Malicious story probe","summary":"This summary contains enough normal words to satisfy the minimum while testing whether blocked markup and script payloads can enter the story pipeline at all today.","visibility":"public","anonymous":false,"allowedViewerIds":[],"tags":[],"links":[],"status":"draft","chapters":[{"title":"Chapter 1","body":"<script>alert(1)</script><p>This chapter body intentionally includes blocked markup while still containing enough normal text to satisfy the minimum body length if the validator were unsafe.</p><p>It should be rejected before storage.</p>","type":"memory","order":1,"imageUrls":[],"moments":[]}]}'

echo
echo '=== safe anonymous message ==='
printf '%s\n' "$safe_message"

echo '=== unauthorized helper unlock ==='
curl -i -s -X POST "$API_BASE_URL/api/anonymous-messages/$message_id/helper-contact/unlock" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $token" \
  --data '{"helperName":"Probe Helper","helperPhone":"+1234567890"}'

echo
echo '=== anonymous comments without slug ==='
curl -i -s "$API_BASE_URL/api/comments?targetType=anonymousMessage&targetId=$message_id"

echo
echo '=== anonymous comments with slug ==='
curl -i -s "$API_BASE_URL/api/comments?targetType=anonymousMessage&targetId=$message_id&shareSlug=$share_slug"

echo
echo '=== public anonymous fetch by slug ==='
curl -i -s "$API_BASE_URL/api/anonymous-messages/$share_slug"
