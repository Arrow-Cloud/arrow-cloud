import JSZip from 'jszip';

export interface ImageData {
  data: Buffer;
  extension: string;
  mimeType: string;
}

export interface SimfileData {
  folderName: string;
  simfileContent: string;
  bannerImage?: ImageData;
  backgroundImage?: ImageData;
  jacketImage?: ImageData;
}

export interface PackData {
  name: string;
  simfiles: SimfileData[];
  bannerImage?: ImageData;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const SIMFILE_EXTENSIONS = ['ssc', 'sm'];

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getMimeTypeFromExtension(extension: string): string {
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

function isImageFile(filename: string): boolean {
  const extension = getFileExtension(filename);
  return IMAGE_EXTENSIONS.includes(extension);
}

function isSimfile(filename: string): boolean {
  const extension = getFileExtension(filename);
  return SIMFILE_EXTENSIONS.includes(extension);
}

function findImageByPattern(zip: JSZip, folderPath: string, patterns: string[]): ImageData | undefined {
  // Look for images matching any of the given patterns
  for (const [path, file] of Object.entries(zip.files)) {
    if (!file.dir && path.startsWith(folderPath) && isImageFile(path)) {
      const filename = path.substring(folderPath.length).toLowerCase();
      const nameWithoutExt = filename.split('.')[0];

      for (const pattern of patterns) {
        if (nameWithoutExt.includes(pattern)) {
          const extension = getFileExtension(filename);
          return {
            data: file.async('nodebuffer') as any, // Will be awaited later
            extension,
            mimeType: getMimeTypeFromExtension(extension),
          };
        }
      }
    }
  }
  return undefined;
}

async function resolveImageData(imageData: ImageData | undefined): Promise<ImageData | undefined> {
  if (!imageData) return undefined;

  // If data is a promise, await it
  if (imageData.data instanceof Promise) {
    imageData.data = await imageData.data;
  }

  return imageData;
}

function extractImageFilenameFromSimfile(content: string, field: 'BANNER' | 'BACKGROUND' | 'JACKET'): string | null {
  const regex = new RegExp(`#${field}:(.+?);`, 'i');
  const match = content.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

function isBannerFile(filename: string): boolean {
  const name = filename.toLowerCase();
  return isImageFile(filename) && (name.includes('banner') || name.includes('bn') || name === 'banner.png' || name === 'banner.jpg' || name === 'banner.jpeg');
}

export async function extractAndProcessPack(zipBuffer: Buffer): Promise<PackData> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);

    // Find the pack folder by looking for folders that contain subfolders with simfiles
    const allFiles = Object.keys(zip.files);
    const potentialPackFolders = new Set<string>();

    // Look for simfiles and extract their parent folder paths
    for (const filePath of allFiles) {
      if (isSimfile(filePath)) {
        const pathParts = filePath.split('/');

        // For a simfile at path like "pack/simfile/file.ssc", the pack folder is "pack"
        if (pathParts.length >= 3) {
          potentialPackFolders.add(pathParts[0]);
        }
      }
    }

    if (potentialPackFolders.size === 0) {
      throw new Error('No pack folder found - no simfiles detected in zip structure');
    }

    const packName = Array.from(potentialPackFolders)[0];

    // Find pack-level banner
    let packBanner: ImageData | undefined;
    const packBannerFile = Object.keys(zip.files).find((name) => {
      const pathParts = name.split('/');
      return pathParts.length === 2 && pathParts[0] === packName && isBannerFile(pathParts[1]);
    });

    if (packBannerFile) {
      const file = zip.files[packBannerFile];
      const data = await file.async('nodebuffer');
      const extension = getFileExtension(packBannerFile);
      packBanner = {
        data,
        extension,
        mimeType: getMimeTypeFromExtension(extension),
      };
    } else {
      // Fallback: if there's exactly one image in the root folder, use it as pack banner
      const rootImages = Object.keys(zip.files).filter((name) => {
        const pathParts = name.split('/');
        return pathParts.length === 2 && pathParts[0] === packName && isImageFile(pathParts[1]);
      });

      if (rootImages.length === 1) {
        const file = zip.files[rootImages[0]];
        const data = await file.async('nodebuffer');
        const extension = getFileExtension(rootImages[0]);
        packBanner = {
          data,
          extension,
          mimeType: getMimeTypeFromExtension(extension),
        };
      }
    }

    const simfileFolders = new Set<string>();

    for (const filePath of Object.keys(zip.files)) {
      const pathParts = filePath.split('/');
      if (pathParts.length >= 3 && pathParts[0] === packName && isSimfile(pathParts[pathParts.length - 1])) {
        simfileFolders.add(`${pathParts[0]}/${pathParts[1]}`);
      }
    }

    if (simfileFolders.size === 0) {
      throw new Error('No folders with simfiles found in pack');
    }

    const simfiles: SimfileData[] = [];

    for (const simfileFolder of simfileFolders) {
      const folderName = simfileFolder.split('/')[1];

      // Find simfile (.ssc takes priority over .sm)
      let simfileContent: string | undefined;

      // Look for .ssc files first
      const sscFiles = Object.keys(zip.files).filter((name) => name.startsWith(simfileFolder + '/') && name.endsWith('.ssc'));

      if (sscFiles.length > 0) {
        const file = zip.files[sscFiles[0]];
        simfileContent = await file.async('text');
      } else {
        // Look for .sm files
        const smFiles = Object.keys(zip.files).filter((name) => name.startsWith(simfileFolder + '/') && name.endsWith('.sm'));

        if (smFiles.length > 0) {
          const file = zip.files[smFiles[0]];
          simfileContent = await file.async('text');
        }
      }

      if (!simfileContent) {
        console.warn(`No simfile found in folder: ${simfileFolder}`);
        continue;
      }

      // Find banner image from simfile metadata
      let bannerImage: ImageData | undefined;
      const bannerFilename = extractImageFilenameFromSimfile(simfileContent, 'BANNER');
      if (bannerFilename) {
        const bannerFilePath = `${simfileFolder}/${bannerFilename}`;
        if (zip.files[bannerFilePath]) {
          const file = zip.files[bannerFilePath];
          const data = await file.async('nodebuffer');
          const extension = getFileExtension(bannerFilename);
          bannerImage = {
            data,
            extension,
            mimeType: getMimeTypeFromExtension(extension),
          };
        }
      }
      // Fallback: look for banner-like filenames
      if (!bannerImage) {
        bannerImage = findImageByPattern(zip, simfileFolder + '/', ['banner', 'bn']);
        bannerImage = await resolveImageData(bannerImage);
      }

      // Find background image from simfile metadata
      let backgroundImage: ImageData | undefined;
      const backgroundFilename = extractImageFilenameFromSimfile(simfileContent, 'BACKGROUND');
      if (backgroundFilename) {
        const backgroundFilePath = `${simfileFolder}/${backgroundFilename}`;
        if (zip.files[backgroundFilePath]) {
          const file = zip.files[backgroundFilePath];
          const data = await file.async('nodebuffer');
          const extension = getFileExtension(backgroundFilename);
          backgroundImage = {
            data,
            extension,
            mimeType: getMimeTypeFromExtension(extension),
          };
        }
      }
      // Fallback: look for background-like filenames
      if (!backgroundImage) {
        backgroundImage = findImageByPattern(zip, simfileFolder + '/', ['background', 'bg']);
        backgroundImage = await resolveImageData(backgroundImage);
      }

      // Find jacket image from simfile metadata (if supported)
      let jacketImage: ImageData | undefined;
      const jacketFilename = extractImageFilenameFromSimfile(simfileContent, 'JACKET');
      if (jacketFilename) {
        const jacketFilePath = `${simfileFolder}/${jacketFilename}`;
        if (zip.files[jacketFilePath]) {
          const file = zip.files[jacketFilePath];
          const data = await file.async('nodebuffer');
          const extension = getFileExtension(jacketFilename);
          jacketImage = {
            data,
            extension,
            mimeType: getMimeTypeFromExtension(extension),
          };
        }
      }
      // Fallback: look for jacket-like filenames
      if (!jacketImage) {
        jacketImage = findImageByPattern(zip, simfileFolder + '/', ['jacket']);
        jacketImage = await resolveImageData(jacketImage);
      }

      simfiles.push({
        folderName,
        simfileContent,
        bannerImage,
        backgroundImage,
        jacketImage,
      });
    }

    return {
      name: packName,
      simfiles,
      bannerImage: packBanner,
    };
  } catch (error) {
    console.error('extractAndProcessPack: Error processing pack:', error);
    throw error;
  }
}
