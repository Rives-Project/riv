## Host toolchain stage
FROM cartesi/toolchain:0.17.0 AS host-tools-stage
RUN apt-get update && \
    apt-get install -y squashfs-tools && \
    rm -rf /var/lib/apt

################################
# Busybox stage
FROM --platform=linux/riscv64 riscv64/busybox:1.36.1-musl AS busybox-stage

################################
# Toolchain stage
FROM --platform=linux/riscv64 menci/archlinuxarm:base-devel AS riv-toolchain-stage

# Update and install development packages
RUN pacman -Syyu --noconfirm --ignore filesystem && \
    pacman -Rns --noconfirm $(pacman -Qtdq) && \
    pacman -Scc --noconfirm && rm -rf /var/cache/pacman/pkg

# Add build user
RUN useradd -m -s /bin/bash builder

# Install more development packages
RUN pacman -S --noconfirm wget git busybox elfkickers bubblewrap && \
    pacman -Scc --noconfirm && rm -rf /var/cache/pacman/pkg

WORKDIR /home/builder

# ################################
# # Build mir jit
# FROM --platform=linux/riscv64 riv-toolchain-stage AS mirjit-stage
# RUN wget -O vnmakarov-mir.tar.gz https://github.com/vnmakarov/mir/tarball/5dcba9a5e500f821dafbbf1db729742038bc5a80 && \
#     tar -xzf vnmakarov-mir.tar.gz && \
#     mv vnmakarov-mir-* vnmakarov-mir && cd vnmakarov-mir && \
#     echo "echo fail" > check-threads.sh && \
#     mkdir -p /pkg/usr && \
#     make PREFIX=/pkg/usr && \
#     make install PREFIX=/pkg/usr && \
#     rm -f /pkg/usr/lib/*.a && \
#     strip /pkg/usr/bin/* && \
#     strip -S -x /pkg/usr/lib/*.so.* && \
#     tree /pkg/usr && cp -a /pkg/usr/* /usr/

################################
# Build nelua
FROM --platform=linux/riscv64 riv-toolchain-stage AS nelua-stage
RUN git clone --depth 1 https://aur.archlinux.org/nelua-git.git && \
    cd nelua-git && \
    chown -R builder:builder . && \
    sudo -u builder makepkg -sc --noconfirm && \
    rm nelua-git-debug-*.zst && \
    pacman -U --noconfirm nelua-git-*.zst

# RUN wget -O edubart-nelua-lang.tar.gz https://github.com/edubart/nelua-lang/tarball/9f75e009db190feda0f90ae858b48fd82f51b8b1 && \
#     tar -xzf edubart-nelua-lang.tar.gz && \
#     mv edubart-nelua-lang-* edubart-nelua-lang && cd edubart-nelua-lang && \
#     mkdir -p /pkg/usr && \
#     make PREFIX=/pkg/usr nelua-lua nelua-luac && \
#     make install PREFIX=/pkg/usr && \
#     cp nelua-luac /pkg/usr/bin/nelua-luac && \
#     strip /pkg/usr/bin/nelua-lua /pkg/usr/bin/nelua-luac && \
#     ln -s nelua-lua /pkg/usr/bin/lua5.4 && \
#     ln -s nelua-luac /pkg/usr/bin/luac5.4 && \
#     tree /pkg/usr && cp -a /pkg/usr/* /usr/

# ################################
# # Build cffi-lua
# FROM --platform=linux/riscv64 riv-toolchain-stage AS cffi-lua-stage
# RUN apk add cmake meson lua5.4-dev lua5.4-libs libffi-dev
# RUN mkdir -p /pkg/usr/lib /pkg/usr/include && \
#     cp -L /usr/lib/lua5.4/liblua.so /pkg/usr/lib/liblua5.4.so && \
#     cp -L /usr/lib/lua5.4/liblua.a /pkg/usr/lib/liblua5.4.a && \
#     cp -R /usr/include/lua5.4 /pkg/usr/include/lua5.4
# RUN wget -O q66-cffi-lua.tar.gz https://github.com/q66/cffi-lua/tarball/2e0c577c4c3aad3da543040200d1303798780616 && \
#     tar -xzf q66-cffi-lua.tar.gz && \
#     mv q66-cffi-lua-* q66-cffi-lua && cd q66-cffi-lua && \
#     mkdir -p /pkg/usr && \
#     meson build -Dlua_version=5.4 -Dtests=false -Dprefix=/pkg/usr && \
#     ninja -C build && \
#     ninja -C build install && \
#     strip -S -x /pkg/usr/lib/*.so && \
#     tree /pkg/usr && cp -a /pkg/usr/* /usr/

# ################################
# # Build bubblewrap
# FROM --platform=linux/riscv64 riv-toolchain-stage AS bubblewrap-stage
# RUN pacman -S --noconfirm bubblewrap
# RUN apk add autoconf automake libcap-dev libcap-static
# RUN wget -O containers-bubblewrap.tar.gz https://github.com/containers/bubblewrap/tarball/8e51677abd7e3338e4952370bf7d902e37d8cbb6 && \
#     tar -xzf containers-bubblewrap.tar.gz && \
#     mv containers-bubblewrap-* containers-bubblewrap && cd containers-bubblewrap && \
#     ./autogen.sh && \
#     ./configure --prefix=/pkg/usr --enable-require-userns LDFLAGS=-static && \
#     mkdir -p /pkg/usr && \
#     make PREFIX=/pkg/usr && \
#     make install PREFIX=/pkg/usr && \
#     rm -rf /pkg/usr/share && \
#     strip /pkg/usr/bin/* && \
#     tree /pkg/usr && cp -a /pkg/usr/* /usr/

# ################################
# # Build bwrapbox
# FROM --platform=linux/riscv64 riv-toolchain-stage AS bwrapbox-stage
# RUN apk add libseccomp-dev
# RUN wget -O edubart-bwrapbox.tar.gz https://github.com/edubart/bwrapbox/tarball/236cca9a29b551335444a1e902012e8b0e55293f && \
#     tar -xzf edubart-bwrapbox.tar.gz && \
#     mv edubart-bwrapbox-* edubart-bwrapbox && cd edubart-bwrapbox && \
#     mkdir -p /pkg/usr && \
#     make PREFIX=/pkg/usr && \
#     make install PREFIX=/pkg/usr && \
#     strip /pkg/usr/bin/* && \
#     tree /pkg/usr && cp -a /pkg/usr/* /usr/

################################
# Build riv
FROM --platform=linux/riscv64 nelua-stage AS libriv-stage
COPY libs/guest-host riv/libs/guest-host
COPY libriv riv/libriv
RUN make -C riv/libriv

################################
# Download packages
FROM --platform=linux/riscv64 riv-toolchain-stage AS rivos-sdk-stage

# Install development utilities
RUN pacman -S --noconfirm neovim htop tmux ncdu gdb strace squashfs-tools jq && \
    pacman -Scc --noconfirm && rm -rf /var/cache/pacman/pkg

# Install custom packages
COPY --from=nelua-stage /home/builder/nelua-git/nelua-git-*.zst .
RUN pacman -U --noconfirm nelua-git-*.zst && rm -f nelua-git-*.zst

# COPY --from=bwrapbox-stage /pkg/usr /usr
# COPY --from=bubblewrap-stage /pkg/usr /usr
# COPY --from=cffi-lua-stage /pkg/usr /usr

# Make vim an alias to nvim
RUN ln -s /usr/bin/nvim /usr/bin/vim
RUN ln -s busybox /usr/bin/ash

# Install linux-headers
WORKDIR /home/user
COPY kernel/linux-headers.tar.xz linux-headers.tar.xz
RUN tar -xf linux-headers.tar.xz && \
    cp -R include/* /usr/include/ && \
    rm -rf include && \
    rm -f linux-headers.tar.xz

# Make disk smaller
RUN rm -rf /usr/share/locale /usr/share/man && \
    userdel -r builder

# Install skel
COPY rivos/skel/etc /etc
COPY rivos/skel/usr /usr
RUN mkdir -p /cartridge /cartridges /workspace && chown 500:500 /cartridge

################################
# Rootfs stage

WORKDIR /rivos

# Create base filesystem hierarchy
RUN mkdir -p usr/bin usr/lib var/tmp proc sys dev root cartridge cartridges tmp run etc workspace && \
    chmod 555 proc sys && \
    chown 500:500 cartridge && \
    chmod 1777 tmp var/tmp && \
    ln -s usr/bin bin && \
    ln -s usr/sbin sbin && \
    ln -s bin usr/sbin && \
    ln -s usr/lib lib && \
    ln -s /run var/run && \
    ln -s ../proc/mounts etc/mtab

# Install libs
RUN cd /usr/lib && \
    cp -a libgcc_s.so.1 libgcc_s.so.1 libc.so.6 ld-linux-riscv64-lp64d.so.1 /rivos/usr/lib/

# Install busybox
RUN cp /bin/busybox bin/busybox && \
    for i in $(bin/busybox --list-long | grep -v sbin/init | grep -v linuxrc); do \
        ln -s /bin/busybox "/rivos/$i"; \
    done && \
    rm -rf /rivos/linuxrc /linuxrc

# Install bubblewrap and bwrapbox
# RUN cp -a /usr/bin/bwrap usr/bin/bwrap && \
#     cp -a /usr/bin/bwrapbox usr/bin/bwrapbox && \
#     cp -a /usr/lib/bwrapbox usr/lib/bwrapbox

# # Install c2m
# RUN cp -a /usr/bin/c2m usr/bin/c2m && \
#     cp -a /usr/include/c2mir.h usr/include/ && \
#     cp -a /usr/include/mir* usr/include/

# # Install cffi
# RUN cp -aL /usr/lib/libffi.so* usr/lib/

# # Install lua + cffi-lua
# RUN cp -aL /usr/bin/lua5.4 usr/bin/lua5.4 && \
#     cp -aL /usr/lib/liblua5.4.so usr/lib/liblua5.4.so && \
#     cp -aL /usr/include/lua5.4 usr/include/lua5.4 && \
#     cp -a /usr/lib/lua usr/lib/lua

# Install skel files
COPY rivos/skel/etc etc
COPY rivos/skel/usr usr
COPY rivos/skel-sdk /
RUN chmod 600 etc/shadow

################################
# Install libriv
COPY --from=libriv-stage /home/builder/riv/libriv /home/builder/riv/libriv
RUN make -C /home/builder/riv/libriv install install-dev PREFIX=/usr && \
    make -C /home/builder/riv/libriv install install-c-dev PREFIX=/usr DESTDIR=/rivos && \
    rm -rf /home/builder/riv

################################
# Generate rivos.ext2
FROM host-tools-stage AS generate-rivos-stage
COPY --from=rivos-sdk-stage / /rivos-sdk
RUN xgenext2fs \
    --faketime \
    --allow-holes \
    --block-size 4096 \
    --bytes-per-inode 4096 \
    --volume-label rivos --root /rivos-sdk/rivos /rivos.ext2 && \
    xgenext2fs \
        --faketime \
        --allow-holes \
        --readjustment +$((64*1024*1024/4096)) \
        --block-size 4096 \
        --bytes-per-inode 4096 \
        --volume-label rivos-sdk --root /rivos-sdk /rivos-sdk.ext2

################################
FROM --platform=linux/riscv64 rivos-sdk-stage AS toolchain-rivos-final-stage
COPY --from=generate-rivos-stage /rivos.ext2 /rivos.ext2
COPY --from=generate-rivos-stage /rivos-sdk.ext2 /rivos-sdk.ext2

# Install workaround to run env as current user
COPY --chmod=755 rivos/docker-entrypoint.sh /usr/sbin/docker-entrypoint.sh
ENTRYPOINT ["/usr/sbin/docker-entrypoint.sh"]
CMD ["/bin/bash", "-l"]
