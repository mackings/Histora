package media

type SignedUpload struct {
	UploadURL string `json:"uploadUrl"`
	ObjectKey string `json:"objectKey"`
	PublicURL string `json:"publicUrl,omitempty"`
}

type SignedRead struct {
	ReadURL string `json:"readUrl"`
}
