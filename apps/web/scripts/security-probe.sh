#!/bin/zsh
set -euo pipefail

API_BASE_URL="${HISTORA_API_URL:-http://127.0.0.1:4000}"
WEB_ORIGIN="${HISTORA_WEB_URL:-http://localhost:3000}"
cookie_jar=$(mktemp)
trap 'rm -f "$cookie_jar"' EXIT

login_json=$(
  curl -s -c "$cookie_jar" -X POST "$API_BASE_URL/api/auth/login" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    --data '{"email":"studioe2e@gmail.com","password":"TestPassword123","deviceId":"test-device-000000000001","deviceName":"Playwright Test Device"}'
)

token=$(printf '%s' "$login_json" | jq -r '.accessToken')

viewer_login_json=$(
  curl -s -X POST "$API_BASE_URL/api/auth/login" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    --data '{"email":"feedauthor@gmail.com","password":"AuthorPass123","deviceId":"test-device-000000000002","deviceName":"Playwright Feed Author Device"}'
)

viewer_token=$(printf '%s' "$viewer_login_json" | jq -r '.accessToken')

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

private_status_json=$(
  curl -s -X POST "$API_BASE_URL/api/statuses" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data '{"body":"Private status probe for unauthorized reaction access checks only.","anonymous":false,"visibility":"private"}'
)
private_status_id=$(printf '%s' "$private_status_json" | jq -r '.id')

private_story_json=$(
  curl -s -X POST "$API_BASE_URL/api/stories" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data '{"title":"Private story probe","summary":"This summary contains enough normal words to meet the minimum while testing whether private story reactions and shares can be triggered by someone who should never be allowed to see the story content at all.","visibility":"private","anonymous":false,"allowedViewerIds":[],"tags":[],"links":[],"status":"published","chapters":[{"title":"Chapter 1","body":"<p>This private story chapter exists only to verify that non viewers cannot trigger reactions or shares against hidden story identifiers from outside the allowed audience. The content itself is ordinary and long enough for validation.</p>","type":"memory","order":1,"imageUrls":[],"moments":[]}]}'
)
private_story_id=$(printf '%s' "$private_story_json" | jq -r '.id')

anonymous_private_status_json=$(
  curl -s -X POST "$API_BASE_URL/api/statuses" \
    -H "Origin: $WEB_ORIGIN" \
    -H "Referer: $WEB_ORIGIN/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data '{"body":"Anonymous private status probe for share slug comment access.","anonymous":true,"visibility":"private"}'
)
anonymous_private_status_id=$(printf '%s' "$anonymous_private_status_json" | jq -r '.id')
anonymous_private_status_slug=$(printf '%s' "$anonymous_private_status_json" | jq -r '.shareSlug')

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

echo
echo '=== access token after logout ==='
curl -i -s -X POST "$API_BASE_URL/api/auth/logout" \
  -b "$cookie_jar" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/"
echo
curl -i -s "$API_BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $token"

echo
echo '=== unauthorized private status reaction ==='
curl -i -s -X POST "$API_BASE_URL/api/statuses/$private_status_id/reactions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $viewer_token" \
  --data '{"action":"like"}'

echo
echo '=== unauthorized private story reaction ==='
curl -i -s -X POST "$API_BASE_URL/api/stories/$private_story_id/reactions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $viewer_token" \
  --data '{"action":"like"}'

echo
echo '=== unauthorized private story share ==='
curl -i -s -X POST "$API_BASE_URL/api/stories/$private_story_id/share" \
  -H "Authorization: Bearer $viewer_token"

echo
echo '=== anonymous private status comments without slug ==='
curl -i -s "$API_BASE_URL/api/comments?targetType=status&targetId=$anonymous_private_status_id"

echo
echo '=== anonymous private status comments with slug ==='
curl -i -s "$API_BASE_URL/api/comments?targetType=status&targetId=$anonymous_private_status_id&shareSlug=$anonymous_private_status_slug"

echo
echo '=== anonymous private status comment post with slug ==='
curl -i -s -X POST "$API_BASE_URL/api/comments" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Referer: $WEB_ORIGIN/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $viewer_token" \
  --data "{\"targetType\":\"status\",\"targetId\":\"$anonymous_private_status_id\",\"shareSlug\":\"$anonymous_private_status_slug\",\"body\":\"Visible only via the share slug.\"}"

echo
echo '=== spoofed image upload ==='
curl -i -s -X POST "$API_BASE_URL/api/media/upload?fileName=probe.png&contentType=image/png" \
  -H "Authorization: Bearer $viewer_token" \
  -H "Content-Type: image/png" \
  --data-binary 'not-a-real-png'
