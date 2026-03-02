FROM public.ecr.aws/lambda/nodejs:20

# Install dependencies needed for Chromium and fonts
RUN dnf update -y && \
    dnf install -y \
    atk \
    cups-libs \
    gtk3 \
    libXcomposite \
    alsa-lib \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    at-spi2-atk \
    libXt \
    xorg-x11-server-Xvfb \
    xorg-x11-xauth \
    dbus-glib \
    dbus-glib-devel \
    nss \
    mesa-libgbm \
    dejavu-sans-fonts \
    dejavu-sans-mono-fonts \
    dejavu-serif-fonts \
    liberation-fonts \
    && dnf clean all

# Copy package files
COPY package*.json ./

# Install production dependencies (includes @sparticuz/chromium)
RUN npm install --omit=dev --production

# Copy built application
COPY dist/ ./

# Copy font assets
COPY assets/ ./assets/

# Set the CMD to your handler
CMD [ "index.handler" ]
