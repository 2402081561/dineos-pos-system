const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dyrtv4fme/image/upload'
const UPLOAD_PRESET = 'dineos-menu'
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

function fileExtension(file) {
  return file.name?.split('.').pop()?.toLowerCase() ?? ''
}

function validateImage(file) {
  if (!file) {
    throw new Error('Please select an image file.')
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type) && !ALLOWED_IMAGE_EXTENSIONS.has(fileExtension(file))) {
    throw new Error('Please choose a JPG, JPEG, PNG, WEBP, HEIC, or HEIF image.')
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image size must be 5 MB or smaller.')
  }
}

export function uploadMenuImage(file, onProgress) {
  validateImage(file)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const formData = new FormData()

    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)

    request.open('POST', CLOUDINARY_UPLOAD_URL)
    request.responseType = 'json'

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }

    request.onerror = () => reject(new Error('Image upload failed. Please check your connection and try again.'))

    request.onload = () => {
      const response = request.response

      if (request.status < 200 || request.status >= 300 || !response?.secure_url) {
        reject(new Error(response?.error?.message ?? 'Image upload failed. Please try again.'))
        return
      }

      onProgress?.(100)
      resolve(response.secure_url)
    }

    request.send(formData)
  })
}
