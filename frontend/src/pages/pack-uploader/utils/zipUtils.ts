import JSZip from 'jszip';

// Zip file creation and download utilities
export const createZipFile = async (files: File[]): Promise<Blob> => {
  const zip = new JSZip();

  // Add each file to the zip with its original path structure
  for (const file of files) {
    // Use the webkitRelativePath to maintain folder structure
    const filePath = file.webkitRelativePath;

    // Read the file content
    const fileContent = await file.arrayBuffer();

    // Add to zip with the original path
    zip.file(filePath, fileContent);

    console.log(`Added to zip: ${filePath}`);
  }

  // Generate the zip file
  console.log('Generating zip file...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  console.log(`Zip file created: ${Math.round(zipBlob.size / 1024)}KB`);

  return zipBlob;
};

export const downloadZip = (zipBlob: Blob, fileName: string) => {
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
