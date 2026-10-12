#!/usr/bin/env python3
"""Fetch pinned upstream QA tools and verify their published checksums."""
import bz2, hashlib, subprocess, sys, tarfile
from pathlib import Path

def main():
    if len(sys.argv)!=2: raise ValueError('Specify a private QA tool directory')
    root=Path(sys.argv[1]);root.mkdir(mode=0o700,parents=True,exist_ok=True)
    if root.is_symlink(): raise ValueError('QA directory must not be a symlink')
    releases=(('rhysd/actionlint','v1.7.12','actionlint_1.7.12_linux_amd64.tar.gz','actionlint_1.7.12_checksums.txt','sha256','actionlint'),
              ('caddyserver/caddy','v2.11.7','caddy_2.11.7_linux_amd64.tar.gz','caddy_2.11.7_checksums.txt','sha512','caddy'),
              ('restic/restic','v0.19.1','restic_0.19.1_linux_amd64.bz2','SHA256SUMS','sha256','restic'))
    for repository,tag,asset,sums,algorithm,name in releases:
        folder=root/(name+'-download')
        folder.mkdir(mode=0o700,exist_ok=True)
        subprocess.run(['gh','release','download',tag,'--repo',repository,'--pattern',asset,'--pattern',sums,'--dir',str(folder),'--clobber'],check=True,stdout=subprocess.DEVNULL)
        checksum=next(line.split()[0] for line in (folder/sums).read_text().splitlines() if line.split()[-1]==asset)
        data=(folder/asset).read_bytes()
        if hashlib.new(algorithm,data).hexdigest()!=checksum: raise ValueError('QA tool checksum mismatch')
        if asset.endswith('.bz2'): (root/name).write_bytes(bz2.decompress(data))
        else:
            with tarfile.open(folder/asset) as archive:
                member=archive.getmember(name)
                if not member.isfile(): raise ValueError('Expected regular QA binary')
                (root/name).write_bytes(archive.extractfile(member).read())
        (root/name).chmod(0o755)
    print('Pinned actionlint, Caddy and Restic checksums verified')

if __name__=='__main__': main()
