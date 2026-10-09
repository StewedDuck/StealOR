const User = require("../models/User");
const ADMIN_GMAILS = [
    "admin@gmail.com",
    "stealors.admin@gmail.com",
    "cooldogng@gmail.com",
];

async function syncUser(req, res) {
    try {
        const { name, email, image } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: "Name and email are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        let user = await User.findOne({
            email: normalizedEmail,
        });
        if (!user) {
            user = await User.create({
                name: name.trim(),
                email: normalizedEmail,
                image: image || null,
                accountRole: ADMIN_GMAILS.includes(normalizedEmail)
                    ? "admin"
                    : "contractor",
            });
        } else {
            if (image !== undefined) {
                user.image = image || null;
            }
        
            if (ADMIN_GMAILS.includes(normalizedEmail)) {
                user.accountRole = "admin";
            }
        
            await user.save();
        }
        return res.json({
            success:true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,
                accountRole: user.accountRole,
                verificationStatus: user.verificationStatus,
            },
        });
    }catch (error) {
        console.error("Sync user error:", error);

        return res.status(500).json({
            success: false,
            error: "ไม่สามารถบันทึกข้อมูลผู้ใช้ได้",
        });
    }
}

async function getProfile(req, res) {
    try {
        const email = req.params.email
            .trim()
            .toLowerCase();

        const user = await User.findOne({
            email,
        }).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found",
            });
        }

        return res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,

                phone: user.phone || "",
                company: user.company || "",
                profileSummary: user.profileSummary || "",
                experienceYears: user.experienceYears || 0,
                experienceSummary: user.experienceSummary || "",
                skills: user.skills || [],

                contractorType: user.contractorType || "individual",
                occupation: user.occupation || "",
                teamSize: user.teamSize ?? 1,

                projectTypes: user.projectTypes || [],
                serviceAreas: user.serviceAreas || [],
                workModes: user.workModes || [],
                certifications: user.certifications || [],

                minProjectBudget: user.minProjectBudget ?? null,
                maxProjectBudget: user.maxProjectBudget ?? null,

                availableFrom: user.availableFrom || null,
                preferredProjectDuration: user.preferredProjectDuration || "",
                additionalInfo: user.additionalInfo || "",

                accountRole: user.accountRole,
                verificationStatus: user.verificationStatus,
            },
        });
    } catch (error) {
        console.error(
            "Get profile error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "ไม่สามารถโหลดข้อมูลโปรไฟล์ได้",
        });
    }
}

async function updateProfile(req, res) {
    try {
        const email = req.params.email
            .trim()
            .toLowerCase();

        const {
            name,
            phone,
            company,
            profileSummary,
            experienceYears,
            experienceSummary,
            skills,

            contractorType,
            occupation,
            teamSize,
            projectTypes,
            serviceAreas,
            workModes,
            certifications,
            minProjectBudget,
            maxProjectBudget,
            availableFrom,
            preferredProjectDuration,
            additionalInfo,
        } = req.body;

        const user = await User.findOne({
            email,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found",
            });
        }

        if (name !== undefined) {
            user.name = String(name).trim();
        }

        if (phone !== undefined) {
            user.phone = String(phone).trim();
        }

        if (company !== undefined) {
            user.company = String(company).trim();
        }

        if (profileSummary !== undefined) {
            user.profileSummary =
                String(profileSummary).trim();
        }

        if (experienceYears !== undefined) {
            user.experienceYears =
                Number(experienceYears) || 0;
        }

        if (experienceSummary !== undefined) {
            user.experienceSummary =
                String(experienceSummary).trim();
        }

        if (skills !== undefined) {
            user.skills = Array.isArray(skills)
                ? skills
                    .map((skill) =>
                        String(skill).trim()
                    )
                    .filter(Boolean)
                : [];
        }

        if (contractorType !== undefined) {
            user.contractorType = contractorType;
        }

        if (occupation !== undefined) {
            user.occupation = String(occupation).trim();
        }

        if (teamSize !== undefined) {
            user.teamSize = Number(teamSize);
        }

        const normalizeList = (values) => {
            if (!Array.isArray(values)) return [];
        
            return [
                ...new Set(
                    values
                        .map((value) => String(value).trim())
                        .filter(Boolean)
                ),
            ];
        };

        if (projectTypes !== undefined) {
            user.projectTypes = normalizeList(projectTypes);
        }
        
        if (serviceAreas !== undefined) {
            user.serviceAreas = normalizeList(serviceAreas);
        }
        
        if (workModes !== undefined) {
            user.workModes = normalizeList(workModes);
        }
        
        if (certifications !== undefined) {
            user.certifications = normalizeList(certifications);
        }

        if (minProjectBudget !== undefined) {
            user.minProjectBudget =
                minProjectBudget === null || minProjectBudget === ""
                    ? null
                    : Number(minProjectBudget);
        }
        
        if (maxProjectBudget !== undefined) {
            user.maxProjectBudget =
                maxProjectBudget === null || maxProjectBudget === ""
                    ? null
                    : Number(maxProjectBudget);
        }

        if (
            user.minProjectBudget !== null &&
            user.maxProjectBudget !== null &&
            user.minProjectBudget > user.maxProjectBudget
        ) {
            return res.status(400).json({
                success: false,
                error: "งบประมาณขั้นต่ำต้องไม่มากกว่างบประมาณสูงสุด",
            });
        }
        
        if (availableFrom !== undefined) {
            user.availableFrom = availableFrom
                ? new Date(availableFrom)
                : null;
        }

        if (preferredProjectDuration !== undefined) {
            user.preferredProjectDuration =
                String(preferredProjectDuration).trim();
        }
        
        if (additionalInfo !== undefined) {
            user.additionalInfo = String(additionalInfo).trim();
        }

        await user.save();

        return res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,

                phone: user.phone,
                company: user.company,
                profileSummary:
                    user.profileSummary,
                experienceYears:
                    user.experienceYears,
                experienceSummary:
                    user.experienceSummary,
                skills: user.skills,

                accountRole: user.accountRole,
                verificationStatus:
                    user.verificationStatus,
            },
            message: "Profile updated successfully",
        });
    } catch (error) {
        console.error(
            "Update profile error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "ไม่สามารถบันทึกโปรไฟล์ได้",
        });
    }
}

module.exports = { syncUser, getProfile, updateProfile };
