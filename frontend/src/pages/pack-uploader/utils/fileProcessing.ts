// File processing configuration
export const FILE_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_SMALL_FILE_SIZE: 1024 * 1024, // 1MB
  EXCLUDED_EXTENSIONS: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'],
  IMAGE_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
  CHART_EXTENSIONS: ['.ssc', '.sm'],
};

// Utility functions for file processing
export const getFileExtension = (fileName: string): string => {
  return fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
};

export const isChartFile = (file: File): boolean => {
  const extension = getFileExtension(file.name);
  return FILE_CONFIG.CHART_EXTENSIONS.includes(extension);
};

export const shouldKeepFile = (file: File): boolean => {
  const extension = getFileExtension(file.name);

  // Skip files that are too large
  if (file.size > FILE_CONFIG.MAX_FILE_SIZE) {
    console.log(`Skipping large file: ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)`);
    return false;
  }

  // Skip excluded file types
  if (FILE_CONFIG.EXCLUDED_EXTENSIONS.includes(extension)) {
    console.log(`Skipping excluded file: ${file.name}`);
    return false;
  }

  // Keep chart files, images, and other small files
  return FILE_CONFIG.CHART_EXTENSIONS.includes(extension) || FILE_CONFIG.IMAGE_EXTENSIONS.includes(extension) || file.size < FILE_CONFIG.MAX_SMALL_FILE_SIZE;
};

export const groupFilesByFolder = (files: FileList): Map<string, File[]> => {
  const folderMap = new Map<string, File[]>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pathParts = file.webkitRelativePath.split('/');

    // Handle pack-level files (banner images in root)
    if (pathParts.length === 2) {
      const packFolder = pathParts[0];
      const isPackImage = FILE_CONFIG.IMAGE_EXTENSIONS.includes(getFileExtension(file.name));
      
      if (isPackImage) {
        console.log(`Found pack-level image: ${file.name}`);
        const packKey = `${packFolder}/_pack_root`;
        if (!folderMap.has(packKey)) {
          folderMap.set(packKey, []);
        }
        folderMap.get(packKey)!.push(file);
      }
      continue;
    }

    // Handle chart folder files
    const MIN_CHART_FOLDER_DEPTH = 3;
    if (pathParts.length < MIN_CHART_FOLDER_DEPTH) continue;

    const chartFolderPath = pathParts.slice(0, 2).join('/'); // pack/chartfolder

    if (!folderMap.has(chartFolderPath)) {
      folderMap.set(chartFolderPath, []);
    }
    folderMap.get(chartFolderPath)!.push(file);
  }

  return folderMap;
};

export const processFiles = (files: FileList): File[] => {
  const processedFiles: File[] = [];
  const folderMap = groupFilesByFolder(files);

  console.log(`Found ${folderMap.size} folders (including pack root)`);

  // Process each folder
  for (const [folderPath, folderFiles] of folderMap.entries()) {
    // Handle pack-level files (banner images)
    if (folderPath.endsWith('/_pack_root')) {
      console.log(`Processing pack-level files: ${folderFiles.length} files`);
      for (const file of folderFiles) {
        if (shouldKeepFile(file)) {
          processedFiles.push(file);
          console.log(`Including pack-level file: ${file.name}`);
        }
      }
      continue;
    }

    // Handle chart folders
    const hasChartFile = folderFiles.some(isChartFile);

    if (!hasChartFile) {
      console.log(`Skipping folder ${folderPath} - no chart files found`);
      continue;
    }

    console.log(`Processing chart folder: ${folderPath}`);

    // Filter files in this chart folder
    for (const file of folderFiles) {
      if (shouldKeepFile(file)) {
        processedFiles.push(file);
      } else {
        console.log(`Skipping file: ${file.name}`);
      }
    }
  }

  console.log(`Processed ${processedFiles.length} files from ${files.length} total files`);
  return processedFiles;
};
