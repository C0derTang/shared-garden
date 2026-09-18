FROM --platform=linux/amd64 amazonlinux@sha256:74c545e3e04db388b00bd31d7cc5640d4e9c12058a6d72af938d113da3c82893
RUN dnf --releasever=2023.12.20260831 install -y --allowerasing gnupg2-2.3.7-1.amzn2023.0.9 gcc-11.5.0-5.amzn2023.0.5 glibc-2.34-231.amzn2023.0.5 make-4.3-5.amzn2023.0.2 nasm-2.15.05-1.amzn2023.0.6 tar-1.34-1.amzn2023.0.4 xz-5.2.5-9.amzn2023.0.2 gzip-1.12-1.amzn2023.0.1 python3-3.9.25-1.amzn2023.0.9 time-1.9-16.amzn2023.0.2 file-5.39-7.amzn2023.0.4 && dnf clean all
WORKDIR /probe
