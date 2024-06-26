import { logger, queries } from "../../../index";
import { Octokit } from "@octokit/rest";
import { Job, JobConfig, JobRunnerMetadata, JobStatus } from "../JobsClass";
import { JobNames } from "../JobConfigs";
import { jobStatusEmitter } from "../../../Events";
import { defaultReleaseTagFormat } from "../../../constants";

export const monitorLabel = { label: "Monitor" };

export class MonitorJob extends Job {
  constructor(jobConfig: JobConfig, jobRunnerMetadata: JobRunnerMetadata) {
    super(jobConfig, jobRunnerMetadata);
  }
}

export const getLatestTaggedRelease = async (releaseTagFormat: string) => {
  try {
    const start = Date.now();

    logger.info(`Running Monitor job`, monitorLabel);

    let latestRelease;
    const ghApi = new Octokit();

    try {
      const list = await ghApi.repos.listReleases({
        owner: "paritytech",
        repo: "polkadot-sdk",
      });
      const filtered = list.data.filter((item) => {
        // eslint-disable-next-line security/detect-non-literal-regexp
        const regex = new RegExp(
          releaseTagFormat ? releaseTagFormat : defaultReleaseTagFormat,
        );
        return regex.test(item.tag_name);
      });

      latestRelease = filtered[0];
    } catch {
      logger.warn("Could not get latest release.", monitorLabel);
    }

    if (
      !latestRelease ||
      !latestRelease.tag_name ||
      !latestRelease.published_at
    ) {
      return;
    }

    const { tag_name, published_at } = latestRelease;
    const publishedAt = new Date(published_at).getTime();

    const version = tag_name.split("-")[1];

    await queries.setRelease(version, publishedAt);

    const taggedReleaseName = latestRelease ? latestRelease.name : "";
    if (latestRelease && version === taggedReleaseName) {
      logger.info("No new release found", monitorLabel);
    } else {
      latestRelease = {
        name: version,
        publishedAt,
      };
    }

    logger.info(
      `Latest release updated: ${version} | Published at: ${publishedAt}`,
      monitorLabel,
    );

    const end = Date.now();

    logger.info(`Done. Took ${(end - start) / 1000} seconds`, monitorLabel);
  } catch (e) {
    logger.error(`Error running monitor job: ${e}`, monitorLabel);
    const errorStatus: JobStatus = {
      status: "errored",
      name: JobNames.Monitor,
      updated: Date.now(),
      error: JSON.stringify(e),
    };

    jobStatusEmitter.emit("jobErrored", errorStatus);
  }
};

// Called by worker to process Job
// export const processReleaseMonitorJob = async (job: any) => {
//   await getLatestTaggedRelease();
// };
