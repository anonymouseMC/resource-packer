generates optifine & gtceu bloom textures from labpbr textures

![image](https://github.com/anonymouseMC/resource-packer/assets/137281947/dc14c931-7240-4512-b74f-91d20c594a9a)

usage: `node build.js`

config is in-file.

depends on: imagemagick's `convert`, and nodejs 18.

probably only works on unix-like paths. if you want to run this on windows, try cygwin.

usage for texture artists:
- texture.png    - base texture
- texture.s.png  - (optional) specular texture
- texture.meta   - (optional) mcmeta. will be applied to specular aswell if it exists.

EG: the above would generate:
- texture.png
- texture_s.png  - for labpbr shaderpacks
- texture_e.png  - for optifine emission
- texture.png.mcmeta - contains texture.meta
- texture_s.png.mcmeta - contains texture.meta
- texture_e.png.mcmeta - contains texture.meta AND a template config to make CEU interpret it as bloomable.
